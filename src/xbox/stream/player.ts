import { MediaStream, RTCPeerConnection, RTCRtpReceiver } from 'react-native-webrtc';

import { IceCandidate } from './session';

// Lecteur du stream : connexion WebRTC, canaux de données et entrées manette.
// Source : github.com/unknownskl/xbox-xcloud-player v1.0.0-beta7 — src/player.ts, lib/sdp.ts, lib/ice.ts,
// channel/message.ts, channel/control.ts, channel/input.ts, channel/input/packet.ts (vérifié le 2026-09-23).

type DataChannel = ReturnType<RTCPeerConnection['createDataChannel']>;

export type PadState = {
  buttons: number; // masque de bits, voir BUTTON_BITS
  leftX: number; // -1 à 1
  leftY: number;
  rightX: number;
  rightY: number;
  leftTrigger: number; // 0 à 1
  rightTrigger: number;
};

// Bits des boutons dans le paquet manette (packet.ts, _writeGamepadData).
export const BUTTON_BITS = {
  Nexus: 2,
  Menu: 4,
  View: 8,
  A: 16,
  B: 32,
  X: 64,
  Y: 128,
  Up: 256,
  Down: 512,
  Left: 1024,
  Right: 2048,
  LB: 4096,
  RB: 8192,
  LS: 16384,
  RS: 32768,
} as const;

export const EMPTY_PAD: PadState = { buttons: 0, leftX: 0, leftY: 0, rightX: 0, rightY: 0, leftTrigger: 0, rightTrigger: 0 };

const REPORT_GAMEPAD = 2;
const REPORT_CLIENT_METADATA = 8;
const REPORT_SERVER_METADATA = 16;
const REPORT_VIBRATION = 128;

export class StreamPlayer {
  private pc = new RTCPeerConnection({});
  private channels: Record<'chat' | 'control' | 'input' | 'message', DataChannel>;
  private localCandidates: IceCandidate[] = [];
  private inputSequence = 0;
  private pad: PadState = EMPTY_PAD;
  private inputReady = false;
  private timers: ReturnType<typeof setInterval | typeof setTimeout>[] = [];

  onRumble?: (strength: number) => void; // vibration demandée par le jeu (0 à 1)
  onVideo?: (stream: MediaStream) => void;
  onConnectionState?: (state: string) => void;
  onEnded?: () => void;

  constructor() {
    this.pc.addTransceiver('audio', { direction: 'sendrecv' });
    const video = this.pc.addTransceiver('video', { direction: 'recvonly' });
    video.setCodecPreferences(h264First());

    this.pc.ontrack = (event: { track: { kind: string } | null; streams: MediaStream[] }) => {
      if (event.track?.kind === 'video' && event.streams[0]) this.onVideo?.(event.streams[0]);
    };
    this.pc.onicecandidate = (event: { candidate: IceCandidate | null }) => {
      if (event.candidate) {
        this.localCandidates.push({
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        });
      }
    };
    this.pc.onconnectionstatechange = () => {
      this.onConnectionState?.(this.pc.connectionState);
    };

    // Mêmes noms, protocoles et ordre que xbox-xcloud-player.
    this.channels = {
      chat: this.pc.createDataChannel('chat', { protocol: 'chatV1', ordered: true }),
      control: this.pc.createDataChannel('control', { protocol: 'controlV1', ordered: true }),
      input: this.pc.createDataChannel('input', { protocol: '1.0', ordered: true }),
      message: this.pc.createDataChannel('message', { protocol: 'messageV1', ordered: true }),
    };

    this.channels.message.onopen = () => {
      this.sendJson('message', { type: 'Handshake', version: 'messageV1', id: 'be0bfc6d-1e83-4c8a-90ed-fa8601c5a179', cv: '0' });
    };
    this.channels.message.onmessage = (event: { data: string | ArrayBuffer }) => {
      try {
        this.onMessage(event.data);
      } catch {
        // Message illisible : on l'ignore, le stream continue.
      }
    };
    this.channels.input.onmessage = (event: { data: string | ArrayBuffer }) => {
      if (typeof event.data !== 'string') this.onInputReport(new DataView(event.data));
    };
  }

  // Rapports de la console sur le canal « input » : ordres de vibration
  // (format de XStreaming, src/webrtc/Channel/Input.ts, vérifié le 2026-09-24).
  private onInputReport(data: DataView) {
    if (data.byteLength < 2) return;
    const reportType = data.getUint16(0, true);
    let i = 2;
    if (reportType & REPORT_SERVER_METADATA) i += 8;
    if (!(reportType & REPORT_VIBRATION) || data.byteLength < i + 10) return;
    // i : type de vibration, i+1 : index de manette, puis moteurs gauche, droit, gâchette G, gâchette D (en %).
    const motors = [2, 3, 4, 5].map((offset) => data.getUint8(i + offset) / 100);
    this.onRumble?.(Math.max(...motors));
  }

  // Offre vidéo à envoyer à la console (audio en stéréo, comme lib/sdp.ts).
  async createOffer(): Promise<string> {
    const offer = await this.pc.createOffer({});
    const sdp = withoutPlayoutDelay((offer.sdp ?? '').replace('useinbandfec=1', 'useinbandfec=1; stereo=1'));
    await this.pc.setLocalDescription({ type: 'offer', sdp });
    return sdp;
  }

  async setAnswer(sdp: string) {
    await this.pc.setRemoteDescription({ type: 'answer', sdp: withoutPlayoutDelay(sdp) });
  }

  // Adresses réseau locales : on attend la fin de leur collecte (3 s au plus).
  async getLocalCandidates(): Promise<IceCandidate[]> {
    const deadline = Date.now() + 3000;
    while (this.pc.iceGatheringState !== 'complete' && Date.now() < deadline) {
      await sleep(100);
    }
    return this.localCandidates;
  }

  async addRemoteCandidates(candidates: IceCandidate[]) {
    for (const c of candidates) {
      if (!c.candidate || c.candidate.includes('end-of-candidates')) continue;
      const init = { sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex };

      // Adresse Teredo (2001:…) : on ajoute aussi l'adresse IPv4 cachée dedans (lib/ice.ts).
      const address = c.candidate.split(' ')[4] ?? '';
      const teredo = address.startsWith('2001') ? parseTeredo(address) : null;
      if (teredo) {
        await this.addCandidate({ ...init, candidate: `candidate:10 1 UDP 1 ${teredo.ip} 9002 typ host ` });
        await this.addCandidate({ ...init, candidate: `candidate:11 1 UDP 1 ${teredo.ip} ${teredo.port} typ host ` });
      }
      await this.addCandidate({ ...init, candidate: c.candidate.replace(/^a=/, '') });
    }
  }

  // Nouvel état de la manette : envoyé tout de suite s'il a changé.
  setPad(pad: PadState) {
    const changed = JSON.stringify(pad) !== JSON.stringify(this.pad);
    this.pad = pad;
    if (changed) this.sendPad();
  }

  destroy() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.sendJson('control', { message: 'gamepadChanged', gamepadIndex: 0, wasAdded: false });
    this.pc.close();
  }

  // ---------- Canaux de données ----------

  private onMessage(data: unknown) {
    const message = JSON.parse(typeof data === 'string' ? data : decodeUtf8(data as ArrayBuffer));

    if (message.type === 'HandshakeAck') {
      this.startControl();
      this.sendConfig();
      return;
    }

    if (message.type === 'TransactionStart' || message.type === 'Message') {
      if (message.target === '/streaming/sessionLifetimeManagement/serverInitiatedDisconnect') {
        this.completeTransaction(message.id, '');
        this.onEnded?.();
      } else if (message.target === '/streaming/systemUi/messages/ShowMessageDialog') {
        this.completeTransaction(message.id, { Result: 0 });
      }
    }
  }

  // Séquence de XStreaming (github.com/Geocld/XStreaming, src/webrtc/Channel/Control.ts, vérifié le 2026-09-24) :
  // autorisation → démarrage des entrées → manette « retirée » → 500 ms → manette « ajoutée ».
  // Annoncer la manette tout de suite, avant le canal d'entrées, la rendait invisible aux jeux
  // (« Aucune manette détectée » dans Resident Evil 4).
  private startControl() {
    this.sendJson('control', { message: 'authorizationRequest', accessKey: '4BDB3609-C1F1-4195-9B37-FEFF45DA8B8E' });
    this.startInput();
    this.sendJson('control', { message: 'gamepadChanged', gamepadIndex: 0, wasAdded: false });
    this.timers.push(
      setTimeout(() => this.sendJson('control', { message: 'gamepadChanged', gamepadIndex: 0, wasAdded: true }), 500),
    );

    // Image complète toutes les 5 s (keyframe_interval par défaut).
    this.timers.push(
      setInterval(() => this.sendJson('control', { message: 'videoKeyframeRequested', ifrRequested: true }), 5000),
    );
  }

  private startInput() {
    // Paquet « métadonnées client » : en-tête de 14 octets + nombre de points tactiles.
    const packet = header(REPORT_CLIENT_METADATA, 0, 15);
    packet.setUint8(14, 1);
    this.send('input', packet);

    this.inputReady = true;
    this.sendPad();
    // Renvoi régulier de l'état, au cas où un paquet se perdrait.
    this.timers.push(setInterval(() => this.sendPad(), 100));
  }

  private sendConfig() {
    const message = (target: string, content: object) =>
      this.sendJson('message', { type: 'Message', content: JSON.stringify(content), id: uuid(), target, cv: '' });

    message('/streaming/systemUi/configuration', { version: [0, 2, 0], systemUis: [] });
    message('/streaming/properties/clientappinstallidchanged', { clientAppInstallId: 'c97d7ee0-73b2-4239-bf1d-9d805a338429' });
    message('/streaming/characteristics/orientationchanged', { orientation: 0 });
    message('/streaming/characteristics/touchinputenabledchanged', { touchInputEnabled: false });
    message('/streaming/characteristics/clientdevicecapabilities', {});
    message('/streaming/characteristics/dimensionschanged', {
      horizontal: 1920,
      vertical: 1080,
      preferredWidth: 1920,
      preferredHeight: 1080,
      safeAreaLeft: 0,
      safeAreaTop: 0,
      safeAreaRight: 1920,
      safeAreaBottom: 1080,
      supportsCustomResolution: true,
    });
  }

  private completeTransaction(id: string, content: unknown) {
    this.sendJson('message', { type: 'TransactionComplete', content: JSON.stringify(content), id, cv: '' });
  }

  // Paquet manette : en-tête 14 octets + 1 octet (nombre de manettes) + 22 octets (packet.ts).
  private sendPad() {
    if (!this.inputReady) return;
    const p = this.pad;
    const packet = header(REPORT_GAMEPAD, ++this.inputSequence, 14 + 1 + 23);

    packet.setUint8(14, 1); // une manette
    packet.setUint8(15, 0); // index 0
    packet.setUint16(16, p.buttons, true);
    packet.setInt16(18, axis(p.leftX), true);
    packet.setInt16(20, axis(-p.leftY), true);
    packet.setInt16(22, axis(p.rightX), true);
    packet.setInt16(24, axis(-p.rightY), true);
    packet.setUint16(26, trigger(p.leftTrigger), true);
    packet.setUint16(28, trigger(p.rightTrigger), true);
    // Commandes physiquement actionnées, et 0 en virtuel (XStreaming, src/webrtc/Packet/index.ts).
    packet.setUint32(30, physicality(p), true); // PhysicalPhysicality
    packet.setUint32(34, 0, true); // VirtualPhysicality
    this.send('input', packet);
  }

  private sendJson(channel: keyof StreamPlayer['channels'], value: object) {
    // xbox-xcloud-player envoie aussi le texte sous forme d'octets (lib/channel.ts).
    this.send(channel, new DataView(encodeUtf8(JSON.stringify(value)).buffer));
  }

  private send(channel: keyof StreamPlayer['channels'], packet: DataView) {
    const dc = this.channels[channel];
    if (dc.readyState === 'open') dc.send(packet);
  }

  private async addCandidate(candidate: IceCandidate) {
    try {
      await this.pc.addIceCandidate(candidate);
    } catch {
      // Adresse inutilisable : on passe à la suivante.
    }
  }
}

// ---------- Outils ----------

// Extension RTP « playout-delay » : la console demande min = max = 0 (affichage immédiat).
// WebRTC donne alors l'horodatage 0 à chaque image (VCMTiming::RenderTimeInternal, mode faible latence),
// et l'afficheur iOS RTCMTLVideoView ignore toute image dont l'horodatage égale le précédent :
// l'image reste figée sur la première. On retire donc cette extension de la négociation.
// Sources : webrtc-sdk/webrtc m144 — modules/video_coding/timing/timing.cc,
// sdk/objc/components/renderer/metal/RTCMTLVideoView.m ; react-native-webrtc #1677 et #1711.
const PLAYOUT_DELAY = /^a=extmap:\d+(\/\w+)? http:\/\/www\.webrtc\.org\/experiments\/rtp-hdrext\/playout-delay\r?$/m;

function withoutPlayoutDelay(sdp: string) {
  return sdp
    .split('\n')
    .filter((line) => !PLAYOUT_DELAY.test(line))
    .join('\n');
}

// Codecs vidéo dans l'ordre de xbox-xcloud-player (lib/sdp.ts) : H.264 d'abord.
function h264First() {
  const codecs = RTCRtpReceiver.getCapabilities('video')?.codecs ?? [];
  const rank = (c: { mimeType: string; sdpFmtpLine?: string }) => {
    const fmtp = c.sdpFmtpLine ?? '';
    if (c.mimeType.includes('H264')) {
      if (fmtp.includes('profile-level-id=4d')) return 1;
      if (fmtp.includes('profile-level-id=42e')) return 2;
      if (fmtp.includes('profile-level-id=420')) return 3;
      return -1;
    }
    return /ulpfec|flexfec|VP9|VP8/.test(c.mimeType) ? 4 : -1;
  };
  return codecs
    .filter((c) => rank(c) > 0)
    .sort((a, b) => rank(a) - rank(b));
}

// Bits « GamepadInputPhysicality » de XStreaming : quelles commandes sont actionnées.
const PHYSICALITY: [keyof typeof BUTTON_BITS, number][] = [
  ['Up', 0x1], ['Down', 0x2], ['Left', 0x4], ['Right', 0x8],
  ['Menu', 0x10], ['View', 0x20], ['LS', 0x40], ['RS', 0x80],
  ['LB', 0x100], ['RB', 0x200], ['Nexus', 0x400],
  ['A', 0x1000], ['B', 0x2000], ['X', 0x4000], ['Y', 0x8000],
];

function physicality(p: PadState): number {
  let bits = 0;
  for (const [button, bit] of PHYSICALITY) if (p.buttons & BUTTON_BITS[button]) bits |= bit;
  if (p.leftTrigger > 0) bits |= 0x10000;
  if (p.rightTrigger > 0) bits |= 0x20000;
  if (Math.hypot(p.leftX, p.leftY) > 0) bits |= 0x40000 | 0x80000;
  if (Math.hypot(p.rightX, p.rightY) > 0) bits |= 0x100000 | 0x200000;
  return bits >>> 0;
}

function header(reportType: number, sequence: number, size: number) {
  const packet = new DataView(new ArrayBuffer(size));
  packet.setUint16(0, reportType, true);
  packet.setUint32(2, sequence, true);
  packet.setFloat64(6, performance.now(), true);
  return packet;
}

function axis(value: number) {
  return Math.max(-32767, Math.min(32767, Math.round(value * 32767)));
}

function trigger(value: number) {
  return Math.max(0, Math.min(65535, Math.round(value * 65535)));
}

// Teredo : 2001:0:SSSS:SSSS:FFFF:PPPP:CCCC:CCCC — port et IPv4 client inversés bit à bit.
function parseTeredo(address: string): { ip: string; port: number } | null {
  const halves = address.split('::');
  const head = halves[0].split(':').filter(Boolean);
  const tail = halves.length > 1 ? halves[1].split(':').filter(Boolean) : [];
  const groups = [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail].map((g) => parseInt(g, 16));
  if (groups.length !== 8 || groups[0] !== 0x2001 || groups[1] !== 0) return null;

  const port = ~groups[5] & 0xffff;
  const client = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].map((b) => ~b & 0xff);
  return { ip: client.join('.'), port };
}

// Texte <-> octets UTF-8, sans dépendre de TextEncoder/TextDecoder.
function encodeUtf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return new Uint8Array(bytes);
}

function decodeUtf8(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let text = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    const size = b < 0x80 ? 1 : b < 0xe0 ? 2 : b < 0xf0 ? 3 : 4;
    let code = size === 1 ? b : b & (0xff >> (size + 1));
    for (let j = 1; j < size; j++) code = (code << 6) | (bytes[i + j] & 0x3f);
    text += String.fromCodePoint(code);
    i += size;
  }
  return text;
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
