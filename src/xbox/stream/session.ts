import { XhomeToken, getConsoleTransferToken, getXhomeToken } from '../auth';

// Session de stream « xHome » avec la console.
// Source : Greenlight (branche main-v2) packages/desktop/main/helpers/xcloudapi.ts et streammanager.ts
// (vérifié le 2026-09-23). NON OFFICIEL : Microsoft peut changer ce service sans prévenir.

export type IceCandidate = {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
};

// Ce que Greenlight annonce à Microsoft (application Xbox pour Windows).
const DEVICE_INFO = JSON.stringify({
  appInfo: {
    env: {
      clientAppId: 'Microsoft.GamingApp',
      clientAppType: 'native',
      clientAppVersion: '2203.1001.4.0',
      clientSdkVersion: '8.5.2',
      httpEnvironment: 'prod',
      sdkInstallId: '',
    },
  },
  dev: {
    hw: { make: 'Microsoft', model: 'Surface Pro', sdktype: 'native' },
    os: { name: 'Windows 11', ver: '22631.2715', platform: 'desktop' },
    displayInfo: {
      dimensions: { widthInPixels: 1920, heightInPixels: 1080 },
      pixelDensity: { dpiX: 1, dpiY: 1 },
    },
  },
});

export class StreamSession {
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  private constructor(
    private token: XhomeToken,
    readonly id: string,
  ) {}

  // 1. Demande l'ouverture d'un stream avec la console (serverId = id de la console, étape 3).
  static async start(serverId: string): Promise<StreamSession> {
    const token = await getXhomeToken();
    const result = await request(
      token,
      'POST',
      '/v5/sessions/home/play',
      {
        titleId: '',
        systemUpdateGroup: '',
        clientSessionId: '',
        settings: {
          nanoVersion: 'V3;WebrtcTransport.dll',
          enableTextToSpeech: false,
          highContrast: 0,
          locale: 'en-US',
          useIceConnection: false,
          timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
          sdkType: 'web',
          osName: 'windows',
        },
        serverId,
        fallbackRegionNames: [],
      },
      { 'X-MS-Device-Info': DEVICE_INFO },
    );

    const id = String(result.sessionPath).split('/').filter(Boolean).pop();
    if (!id) throw new Error('Session de stream sans identifiant.');
    return new StreamSession(token, id);
  }

  // 2. Attend que la console soit prête (« Provisioned »), en l'autorisant au passage.
  async waitUntilReady(onState: (state: string) => void): Promise<void> {
    const deadline = Date.now() + 120_000;
    let authorized = false;

    while (Date.now() < deadline) {
      const result = await this.call('GET', '/state');
      const state: string = result?.state ?? '';
      onState(state);

      if (state === 'Provisioned') return;
      if (state === 'Failed') {
        throw new Error(result?.errorDetails?.message ?? 'La console a refusé la session.');
      }
      if (state === 'ReadyToConnect' && !authorized) {
        await this.call('POST', '/connect', { userToken: await getConsoleTransferToken() });
        authorized = true;
      }
      await sleep(1000);
    }
    throw new Error('La console ne répond pas (délai dépassé).');
  }

  // 3. Échange l'offre vidéo (SDP) et renvoie la réponse de la console.
  async exchangeSdp(offerSdp: string): Promise<string> {
    await this.call('POST', '/sdp', {
      messageType: 'offer',
      sdp: offerSdp,
      configuration: {
        chatConfiguration: {
          bytesPerSample: 2,
          expectedClipDurationMs: 20,
          format: { codec: 'opus', container: 'webm' },
          numChannels: 1,
          sampleFrequencyHz: 24000,
        },
        chat: { minVersion: 1, maxVersion: 1 },
        control: { minVersion: 1, maxVersion: 3 },
        input: { minVersion: 1, maxVersion: 8 },
        message: { minVersion: 1, maxVersion: 1 },
      },
    });

    const result = await this.poll('/sdp');
    const exchange = JSON.parse(result.exchangeResponse);
    if (!exchange.sdp) throw new Error(`Réponse vidéo refusée : ${result.exchangeResponse}`);
    return exchange.sdp;
  }

  // 4. Échange les adresses réseau (ICE) et renvoie celles de la console.
  async exchangeIce(candidates: IceCandidate[]): Promise<IceCandidate[]> {
    await this.call('POST', '/ice', { messageType: 'iceCandidate', candidate: candidates });
    const result = await this.poll('/ice');
    return JSON.parse(result.exchangeResponse);
  }

  // 5. Garde la session ouverte (toutes les 30 s, comme Greenlight).
  startKeepalive() {
    this.keepaliveTimer ??= setInterval(() => {
      this.call('POST', '/keepalive').catch(() => {});
    }, 30_000);
  }

  async stop() {
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    this.keepaliveTimer = null;
    await this.call('DELETE', '').catch(() => {});
  }

  private call(method: string, suffix: string, body?: object) {
    return request(this.token, method, `/v5/sessions/home/${this.id}${suffix}`, body);
  }

  // Le serveur répond « 204 » tant que la réponse n'est pas prête : on réessaie (750 ms, comme Greenlight).
  private async poll(suffix: string) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const result = await this.call('GET', suffix);
      if (result !== null) return result;
      await sleep(750);
    }
    throw new Error(`Pas de réponse de la console (${suffix}).`);
  }
}

async function request(token: XhomeToken, method: string, path: string, body?: object, headers?: object) {
  const res = await fetch(token.baseUrl + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token.gsToken}`,
      'Cache-Control': 'no-cache',
      ...headers,
    },
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
  });

  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`Stream : ${method} ${path.split('/').pop()} a échoué (${res.status}) ${text.slice(0, 160)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
