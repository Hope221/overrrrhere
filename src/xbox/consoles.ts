import { getXstsToken, xblAuthorization } from './auth';

// Consoles du compte, via le service « SmartGlass » xccs.xboxlive.com.
// Sources : github.com/unknownskl/xbox-webapi-node (branche release/2.0.0), src/provider/smartglass.ts,
// utilisé par Greenlight packages/desktop/main/ipc/consoles.ts ; commandes d'après
// github.com/OpenXbox/xbox-webapi-python, xbox/webapi/api/provider/smartglass (vérifié le 2026-09-24).
// NON OFFICIEL : Microsoft peut changer ce service sans prévenir.

export type ConsoleState = 'on' | 'asleep' | 'offline';

export type XboxConsole = {
  id: string;
  name: string;
  consoleType: string;
  powerState: string; // valeur brute de Microsoft : « On », « ConnectedStandby », « Off »…
  state: ConsoleState;
  remoteManagementEnabled: boolean;
  consoleStreamingEnabled: boolean;
};

export async function getConsoles(): Promise<XboxConsole[]> {
  const body = await xccs('GET', '/lists/devices?queryCurrentDevice=false&includeStorageDevices=true');
  return (body.result ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    consoleType: c.consoleType,
    powerState: c.powerState,
    state: toState(c.powerState),
    remoteManagementEnabled: c.remoteManagementEnabled === true,
    consoleStreamingEnabled: c.consoleStreamingEnabled === true,
  }));
}

// Identifiant de session SmartGlass, un par lancement de l'app (comme xbox-webapi-python).
const SESSION_ID = uuid();

// Commande envoyée à la console : « Shell/ActivateApplicationWithOneStoreProductId », « Power/WakeUp »…
export async function sendCommand(consoleId: string, type: string, command: string, parameters: object[] = [{}]) {
  const body = await xccs('POST', '/commands', {
    destination: 'Xbox',
    type,
    command,
    sessionId: SESSION_ID,
    sourceId: 'com.microsoft.smartglass',
    parameters,
    linkedXboxId: consoleId,
  });
  const errorCode = body.status?.errorCode;
  if (errorCode && errorCode !== 'OK') {
    throw new Error(`La console a refusé la commande ${command} (${errorCode}${body.status?.errorMessage ? ` · ${body.status.errorMessage}` : ''}).`);
  }
  return body;
}

// Réveil et mise en veille (xbox-webapi-python : wake_up, turn_off).
export function wakeUp(consoleId: string) {
  return sendCommand(consoleId, 'Power', 'WakeUp');
}

export function turnOff(consoleId: string) {
  return sendCommand(consoleId, 'Power', 'TurnOff');
}

// Réveille la console si besoin et attend qu'elle soit allumée (60 s au plus).
// Renvoie false si elle n'est pas signalée allumée à temps : on tente quand même la suite.
export async function ensureAwake(consoleId: string, onStatus?: (text: string) => void): Promise<boolean> {
  const current = (await getConsoles()).find((c) => c.id === consoleId);
  if (current?.state === 'on') return true;

  onStatus?.('Réveil de la console…');
  await wakeUp(consoleId);

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await sleep(3000);
    const latest = (await getConsoles()).find((c) => c.id === consoleId);
    if (latest?.state === 'on') return true;
  }
  return false;
}

export async function xccs(method: 'GET' | 'POST', path: string, payload?: object) {
  const xsts = await getXstsToken('http://xboxlive.com');
  const res = await fetch(`https://xccs.xboxlive.com${path}`, {
    method,
    headers: {
      Authorization: xblAuthorization(xsts),
      'x-xbl-contract-version': '4',
      skillplatform: 'RemoteManagement',
      'Accept-Language': 'en-US',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      // Toujours l'état réel : pas de réponse gardée en cache par iOS.
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!res.ok) throw new Error(`Service console indisponible (${path.split('?')[0]} · ${res.status}).`);
  return res.json();
}

function toState(powerState: string): ConsoleState {
  if (powerState === 'On') return 'on';
  if (powerState === 'ConnectedStandby') return 'asleep';
  return 'offline';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
