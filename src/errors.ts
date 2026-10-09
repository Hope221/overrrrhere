// Messages d'erreur (CLAUDE.md, règles du 29/09) : jamais de texte technique à l'écran.
// Le détail part dans les logs ; l'écran reçoit une phrase humaine.

// Erreur dont le message est déjà écrit pour l'utilisateur : il peut s'afficher tel quel.
export class FriendlyError extends Error {}

// Pas de réseau : le fetch de React Native échoue avec « Network request failed » (ou « timed out »).
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError && /network request/i.test(e.message);
}

export function humanError(e: unknown, fallback: string, where: string): string {
  console.warn(`[${where}]`, e instanceof Error ? e.message : e);
  return e instanceof FriendlyError ? e.message : fallback;
}
