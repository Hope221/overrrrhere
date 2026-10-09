import { getXstsToken, xblAuthorization } from './auth';

// Historique de jeu du compte Xbox (titlehub) : dernière partie et succès, pour chaque jeu.
// Source : github.com/OpenXbox/xbox-webapi-python, provider « titlehub » (décorations « scid » et « achievement »),
// vérifié le 2026-09-26. NON OFFICIEL : Microsoft peut changer ce service sans prévenir.
// (Le temps de jeu affiché est « Played here », compté par l'app : voir src/playtime.ts.)

export type Achievements = {
  current: number; // succès débloqués
  total: number;
  gamerscore: number; // G gagnés
  percent: number; // 0 à 100
};

export type TitleHistory = {
  lastPlayed: number | null; // horodatage
  achievements: Achievements | null;
};

export async function getTitleHistory(): Promise<Map<number, TitleHistory>> {
  const xsts = await getXstsToken('http://xboxlive.com');
  const res = await fetch(
    `https://titlehub.xboxlive.com/users/xuid(${xsts.xuid})/titles/titlehistory/decoration/scid,achievement?maxItems=200`,
    {
      headers: {
        Authorization: xblAuthorization(xsts),
        'x-xbl-contract-version': '2',
        'x-xbl-client-name': 'XboxApp',
        'x-xbl-client-type': 'UWA',
        'x-xbl-client-version': '39.39.22001.0',
        'Accept-Language': 'en-US',
        Accept: 'application/json',
      },
    },
  );
  if (!res.ok) throw new Error(`Historique indisponible (${res.status}).`);

  const body = await res.json();
  const map = new Map<number, TitleHistory>();
  for (const title of body.titles ?? []) {
    const time = Date.parse(title.titleHistory?.lastTimePlayed ?? '');
    const a = title.achievement;
    map.set(Number(title.titleId), {
      lastPlayed: Number.isNaN(time) ? null : time,
      // Pas de succès pour ce jeu (total 0) : bloc masqué.
      achievements:
        a && a.totalAchievements > 0
          ? {
              current: a.currentAchievements ?? 0,
              total: a.totalAchievements,
              gamerscore: a.currentGamerscore ?? 0,
              percent: a.progressPercentage ?? (100 * (a.currentAchievements ?? 0)) / a.totalAchievements,
            }
          : null,
    });
  }
  return map;
}

// « yesterday », « 3 weeks ago »… comme la maquette (« Last played yesterday »).
export function formatLastPlayed(time: number, now = Date.now()): string {
  const days = Math.floor((startOfDay(now) - startOfDay(time)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return plural(Math.floor(days / 7), 'week');
  if (days < 365) return plural(Math.floor(days / 30), 'month');
  return plural(Math.floor(days / 365), 'year');
}

function plural(n: number, unit: string) {
  return `${n} ${unit}${n > 1 ? 's' : ''} ago`;
}

function startOfDay(time: number) {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
