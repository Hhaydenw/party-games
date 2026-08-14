// Shared avatar color palette — used both by the server (to auto-assign a
// free color when a player doesn't pick one, or picks an invalid value) and
// the client (to render the picker and the colored initial avatars).
export const AVATAR_COLORS = [
  "#f2b705", // gold
  "#e94560", // accent red
  "#22c55e", // green
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#84cc16", // lime
  "#6366f1", // indigo
];

export function isValidAvatarColor(color: unknown): color is string {
  return typeof color === "string" && AVATAR_COLORS.includes(color);
}

// Picks the first palette color not already in use by the given players,
// cycling back (with slight offset) once everyone's exhausted the palette.
export function pickAvailableColor(usedColors: string[]): string {
  const used = new Set(usedColors);
  const free = AVATAR_COLORS.find((c) => !used.has(c));
  if (free) return free;
  return AVATAR_COLORS[usedColors.length % AVATAR_COLORS.length]!;
}
