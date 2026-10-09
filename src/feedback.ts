import { getSettings } from './settings';

// Sons de l'interface, carillon « jeu prêt » et vibration du téléphone (Settings > Sound, Controller).
// Fichiers dans assets/sounds/*.wav : les remplacer suffit pour changer un son, sans rebuild.
//
// Session audio : on ne change JAMAIS le mode audio global, et chaque son garde la session active
// (keepAudioSessionActive), sinon expo-audio la désactive à la fin du son et coupe le son du stream.

type Sound = 'move' | 'select' | 'back' | 'ready' | 'startup';

const SOURCES: Record<Sound, number> = {
  move: require('../assets/sounds/move.wav'),
  select: require('../assets/sounds/select.wav'),
  back: require('../assets/sounds/back.wav'),
  ready: require('../assets/sounds/ready.wav'),
  // Choisie par Elhadji (« Startup Melody, Warm », coupée à sa fin naturelle, 9,5 s).
  startup: require('../assets/sounds/startup.wav'),
};

const VOLUME = { Low: 0.3, Medium: 0.6, High: 1 };

// Sons d'interface libres (CC0), choisis à l'oreille par Elhadji le 08/10/2026 pour remplacer ceux de la Xbox 360 :
//   move ← misc_menu, ready ← load : Lokif, « GUI Sound Effects » (opengameart.org/content/gui-sound-effects) ;
//   select ← confirm_style_5_004, back ← back_style_5_001 : ObsydianX, « Interface SFX Pack 1 »
//   (obsydianx.itch.io/interface-sfx-pack-1).
// Coupés à leur fin naturelle (-60 dB), fondu 10 ms (ready : 120 ms). Crêtes : move -9 dB, ready -3 dB,
// select -10 dB et back -12 dB (baissés de 6 dB le 08/10 : « A et B trop forts » sur iPhone).
// Mettre un son à false ici le coupe sans toucher aux réglages.
const ENABLED: Record<Sound, boolean> = {
  move: true,
  select: true,
  back: true,
  ready: true,
  startup: true,
};

// Modules natifs chargés à la demande : une app sans eux (build plus ancien) reste simplement muette.
let audio: typeof import('expo-audio') | null | undefined;
let haptics: typeof import('expo-haptics') | null | undefined;

function loadAudio() {
  if (audio === undefined) {
    try {
      audio = require('expo-audio');
    } catch {
      audio = null;
    }
  }
  return audio;
}

function loadHaptics() {
  if (haptics === undefined) {
    try {
      haptics = require('expo-haptics');
    } catch {
      haptics = null;
    }
  }
  return haptics;
}

type Player = ReturnType<typeof import('expo-audio').createAudioPlayer>;

// Plusieurs lecteurs par son d'interface : un appui rapide prend un lecteur libre
// au lieu d'interrompre (et rendre muet) celui qui joue encore.
const POOL: Record<Sound, number> = { move: 3, select: 2, back: 2, ready: 1, startup: 1 };
const pools: Partial<Record<Sound, { players: Player[]; next: number }>> = {};
const players: Partial<Record<Sound, Player>> = {}; // dernier lecteur utilisé (pour stopStartupMelody)

function poolFor(sound: Sound) {
  const module = loadAudio();
  if (!module) return null;
  return (pools[sound] ??= {
    players: Array.from({ length: POOL[sound] }, () => module.createAudioPlayer(SOURCES[sound], { keepAudioSessionActive: true })),
    next: 0,
  });
}

// Précharge tous les sons au démarrage : un son créé au moment de l'appui n'a pas le temps de se
// charger, et le premier appui restait muet.
export function preloadSounds() {
  try {
    (Object.keys(SOURCES) as Sound[]).forEach((sound) => ENABLED[sound] && poolFor(sound));
  } catch {
    // Audio indisponible : l'interface continue sans.
  }
}

function play(sound: Sound) {
  if (!ENABLED[sound]) return;
  try {
    const pool = poolFor(sound);
    if (!pool) return;
    const player = pool.players[pool.next];
    pool.next = (pool.next + 1) % pool.players.length;
    players[sound] = player;
    player.volume = VOLUME[getSettings().volume];
    // Revenir exactement au début AVANT de jouer : sinon, sur un son de 0,07 s, la lecture
    // pouvait partir de la fin du passage précédent et rester muette.
    player
      .seekTo(0, 0, 0)
      .then(() => player.play())
      .catch(() => {});
  } catch {
    // Son indisponible : l'interface continue sans.
  }
}

// Réglage « Interface sounds ».
export function playInterfaceSound(sound: 'move' | 'select' | 'back') {
  if (getSettings().sounds) play(sound);
}

// Mélodie de démarrage : une fois par ouverture de l'app, quand le launcher apparaît
// (réglage « Interface sounds »).
let startupPlayed = false;

export function playStartupMelody() {
  if (startupPlayed) return;
  startupPlayed = true;
  if (getSettings().sounds) play('startup');
}

// Arrête la mélodie en fondu (400 ms) si elle joue encore, par exemple au lancement d'un jeu.
export function stopStartupMelody() {
  const player = players.startup;
  if (!player?.playing) return;
  const start = player.volume;
  let step = 0;
  const timer = setInterval(() => {
    step++;
    player.volume = start * Math.max(0, 1 - step / 8);
    if (step >= 8) {
      clearInterval(timer);
      player.pause();
    }
  }, 50);
}

// Réglage « Chime when your game is ready » : joué quand l'image du stream arrive.
export function playReadyChime() {
  if (getSettings().readyChime) play('ready');
}

// Contrôles tactiles : petite vibration à chaque appui (TouchStream.dc.html), si « Phone vibration » est activé.
export function tapFeedback() {
  const module = loadHaptics();
  if (!module || !getSettings().vibration) return;
  module.impactAsync(module.ImpactFeedbackStyle.Light).catch(() => {});
}

// Réglage « Phone vibration » : l'iPhone vibre quand le jeu fait vibrer la manette.
export function rumble(strength: number) {
  const module = loadHaptics();
  if (!module || !getSettings().vibration || strength <= 0.05) return;
  const style =
    strength > 0.66
      ? module.ImpactFeedbackStyle.Heavy
      : strength > 0.33
        ? module.ImpactFeedbackStyle.Medium
        : module.ImpactFeedbackStyle.Light;
  module.impactAsync(style).catch(() => {});
}
