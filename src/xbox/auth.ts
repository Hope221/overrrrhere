import * as SecureStore from 'expo-secure-store';

import { FriendlyError } from '../errors';
import { clearXboxCache } from './cache';

// Connexion Microsoft / Xbox Live, d'après Greenlight v2.4+ :
// github.com/unknownskl/xal-node, fichier src/msal.ts (vérifié le 2026-09-23).
// Profil : github.com/OpenXbox/xbox-webapi-python (provider « profile »).
// Tout ceci est NON OFFICIEL : Microsoft peut changer ces adresses sans prévenir.

const CLIENT_ID = '1f907974-e22b-4810-a9de-d9647380c97e';
const SCOPE = 'xboxlive.signin openid profile offline_access';
const MS_LOGIN = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const STORE_KEY = 'microsoft-tokens';

const XBOX_HEADERS = {
  'x-xbl-contract-version': '1',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache',
  Origin: 'https://www.xbox.com',
  Referer: 'https://www.xbox.com/',
};

// Messages connus du service XSTS (code « XErr »), affichés tels quels (en anglais, comme l'interface).
const XSTS_ERRORS: Record<string, string> = {
  '2148916233': "This Microsoft account doesn't have an Xbox profile yet.",
  '2148916235': "Xbox Live isn't available in this country.",
  '2148916238': 'This is a child account: an adult must add it to a Microsoft family.',
};

type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type DeviceCode = {
  userCode: string;
  deviceCode: string;
  verificationUrl: string;
  interval: number;
  expiresAt: number;
};

export type XstsToken = {
  token: string;
  uhs: string;
  xuid?: string;
  gamertag?: string;
  notAfter: number;
};

export type Profile = {
  gamertag: string;
  picture: string | null;
};

// Plus de jetons valides : il faut se reconnecter.
export class SignedOutError extends Error {}

// ---------- Étape 1 : code Microsoft (« device code ») ----------

export async function requestDeviceCode(): Promise<DeviceCode> {
  const { ok, body } = await postForm(`${MS_LOGIN}/devicecode`, { client_id: CLIENT_ID, scope: SCOPE });
  if (!ok) throw new Error(body.error_description ?? 'Code Microsoft indisponible.');

  return {
    userCode: body.user_code,
    deviceCode: body.device_code,
    // « otc » préremplit le code : microsoft.com/link le transmet à login.live.com (vérifié le 2026-09-23).
    verificationUrl: `${body.verification_uri}?otc=${encodeURIComponent(body.user_code)}`,
    interval: body.interval ?? 5,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
}

// Interroge Microsoft jusqu'à ce que l'utilisateur ait validé le code sur la page.
export async function waitForSignIn(code: DeviceCode, signal: { cancelled: boolean }): Promise<void> {
  let interval = code.interval;

  while (Date.now() < code.expiresAt) {
    await sleep(interval * 1000);
    if (signal.cancelled) throw new Error('Connexion annulée.');

    const { ok, body } = await postForm(`${MS_LOGIN}/token`, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: CLIENT_ID,
      device_code: code.deviceCode,
    });

    if (ok) {
      await saveTokens(body);
      return;
    }
    if (body.error === 'authorization_pending') continue;
    if (body.error === 'slow_down') {
      interval += 5;
      continue;
    }
    throw new Error(body.error_description ?? body.error ?? 'Connexion refusée.');
  }

  throw new FriendlyError('The sign-in code expired. Try again.');
}

// Un compte Microsoft est-il enregistré sur l'iPhone ? (Sans réseau : « Continue without Xbox » = non.)
export async function hasMicrosoftAccount(): Promise<boolean> {
  return !!(await SecureStore.getItemAsync(STORE_KEY).catch(() => null));
}

export async function signOut(): Promise<void> {
  await SecureStore.deleteItemAsync(STORE_KEY);
  userToken = null;
  xstsCache.clear();
  xhomeToken = null;
  clearXboxCache(); // plus de jeux Xbox affichés hors ligne
}

// ---------- Étape 2 : jeton Microsoft, renouvelé automatiquement ----------

let refreshing: Promise<string> | null = null;

async function getAccessToken(): Promise<string> {
  const raw = await SecureStore.getItemAsync(STORE_KEY);
  if (!raw) throw new SignedOutError('Pas connecté.');

  const stored: StoredTokens = JSON.parse(raw);
  if (stored.expiresAt - Date.now() > 60_000) return stored.accessToken;

  // Un seul renouvellement à la fois : Microsoft remplace le jeton de renouvellement à chaque fois.
  refreshing ??= refreshAccessToken(stored.refreshToken).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { ok, status, body } = await postForm(`${MS_LOGIN}/token`, {
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SCOPE,
  });

  if (!ok) {
    if (status === 400 && body.error === 'invalid_grant') {
      await signOut();
      throw new SignedOutError('Session Microsoft expirée.');
    }
    throw new Error(body.error_description ?? 'Renouvellement Microsoft impossible.');
  }

  return (await saveTokens(body, refreshToken)).accessToken;
}

async function saveTokens(body: any, previousRefreshToken?: string): Promise<StoredTokens> {
  const tokens: StoredTokens = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? previousRefreshToken,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(tokens));
  return tokens;
}

// ---------- Étape 3 : jetons Xbox Live (gardés en mémoire) ----------

let userToken: { token: string; notAfter: number } | null = null;
const xstsCache = new Map<string, XstsToken>();

async function getUserToken(): Promise<string> {
  if (userToken && userToken.notAfter - Date.now() > 60_000) return userToken.token;

  const accessToken = await getAccessToken();
  const body = await postXbox('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: {
      AuthMethod: 'RPS',
      RpsTicket: `d=${accessToken}`,
      SiteName: 'user.auth.xboxlive.com',
    },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT',
  });

  userToken = { token: body.Token, notAfter: Date.parse(body.NotAfter) };
  return userToken.token;
}

// relyingParty : « http://xboxlive.com » pour les services web (profil, consoles),
// « http://gssv.xboxlive.com/ » pour le stream (étape 4).
export async function getXstsToken(relyingParty: string): Promise<XstsToken> {
  const cached = xstsCache.get(relyingParty);
  if (cached && cached.notAfter - Date.now() > 60_000) return cached;

  const body = await postXbox('https://xsts.auth.xboxlive.com/xsts/authorize', {
    Properties: {
      SandboxId: 'RETAIL',
      UserTokens: [await getUserToken()],
    },
    RelyingParty: relyingParty,
    TokenType: 'JWT',
  });

  const claims = body.DisplayClaims.xui[0];
  const token: XstsToken = {
    token: body.Token,
    uhs: claims.uhs,
    xuid: claims.xid,
    gamertag: claims.gtg,
    notAfter: Date.parse(body.NotAfter),
  };
  xstsCache.set(relyingParty, token);
  return token;
}

// En-tête d'autorisation des services web Xbox Live.
export function xblAuthorization(token: XstsToken): string {
  return `XBL3.0 x=${token.uhs};${token.token}`;
}

// ---------- Profil : gamertag et photo ----------

export async function getProfile(): Promise<Profile> {
  const xsts = await getXstsToken('http://xboxlive.com');
  const fallback: Profile = { gamertag: xsts.gamertag ?? '', picture: null };

  const res = await fetch(
    `https://profile.xboxlive.com/users/xuid(${xsts.xuid})/profile/settings?settings=Gamertag,GameDisplayPicRaw`,
    {
      headers: {
        'x-xbl-contract-version': '3',
        Authorization: xblAuthorization(xsts),
        Accept: 'application/json',
      },
    },
  );
  if (!res.ok) return fallback;

  const body = await res.json();
  const settings: { id: string; value: string }[] = body.profileUsers?.[0]?.settings ?? [];
  const setting = (id: string) => settings.find((s) => s.id === id)?.value;

  return {
    gamertag: setting('Gamertag') ?? fallback.gamertag,
    picture: setting('GameDisplayPicRaw') ?? null,
  };
}

// ---------- Stream (étape 4) ----------

export type XhomeToken = {
  gsToken: string;
  baseUrl: string; // serveur de session de la région par défaut
  expiresAt: number;
};

let xhomeToken: XhomeToken | null = null;

// Jeton du service de stream « xHome » (xal-node msal.ts, getStreamToken).
export async function getXhomeToken(): Promise<XhomeToken> {
  if (xhomeToken && xhomeToken.expiresAt - Date.now() > 60_000) return xhomeToken;

  const gssv = await getXstsToken('http://gssv.xboxlive.com/');
  const res = await fetch('https://xhome.gssv-play-prod.xboxlive.com/v2/login/user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, must-revalidate, no-cache',
      'x-gssv-client': 'XboxComBrowser',
    },
    body: JSON.stringify({ token: gssv.token, offeringId: 'xhome' }),
  });
  if (!res.ok) throw new Error(`Jeton de stream refusé (${res.status}).`);

  const body = await res.json();
  const regions: { baseUri: string; isDefault: boolean }[] = body.offeringSettings.regions;
  const region = regions.find((r) => r.isDefault) ?? regions[0];

  xhomeToken = {
    gsToken: body.gsToken,
    baseUrl: region.baseUri,
    expiresAt: Date.now() + body.durationInSeconds * 1000,
  };
  return xhomeToken;
}

// Jeton que la console demande quand la session est « ReadyToConnect » (xal-node msal.ts, getMsalToken).
export async function getConsoleTransferToken(): Promise<string> {
  await getAccessToken(); // renouvelle le jeton Microsoft si besoin
  const raw = await SecureStore.getItemAsync(STORE_KEY);
  if (!raw) throw new SignedOutError('Pas connecté.');
  const stored: StoredTokens = JSON.parse(raw);

  const { ok, body } = await postForm('https://login.live.com/oauth20_token.srf', {
    client_id: CLIENT_ID,
    scope: 'service::http://Passport.NET/purpose::PURPOSE_XBOX_CLOUD_CONSOLE_TRANSFER_TOKEN',
    grant_type: 'refresh_token',
    refresh_token: stored.refreshToken,
  });
  if (!ok) throw new Error(body.error_description ?? 'Autorisation de la console refusée.');
  return body.access_token;
}

// ---------- Outils ----------

async function postForm(url: string, params: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&'),
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
}

async function postXbox(url: string, payload: object) {
  const res = await fetch(url, { method: 'POST', headers: XBOX_HEADERS, body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const known = XSTS_ERRORS[String(body.XErr)];
    if (known) throw new FriendlyError(known);
    throw new Error(`Xbox Live a refusé la connexion (${res.status}${body.XErr ? ` · ${body.XErr}` : ''}).`);
  }
  return body;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
