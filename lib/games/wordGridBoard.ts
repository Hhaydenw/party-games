// Pure, dependency-free board/tile constants and helpers shared by both the
// server-side engine (lib/games/wordGrid.ts) and the client view component.
// Deliberately split out of wordGrid.ts so the client only ever imports
// *these* as real runtime values — wordGrid.ts itself reads a bundled
// dictionary file from disk (Node-only), and the view component only needs
// its exported types (which the bundler elides), never its runtime code.
//
// The premium-square layout below is original (generated to have the same
// kind of symmetric double/triple letter & word pattern any crossword-style
// board needs to be playable) rather than a copy of any specific commercial
// game's exact layout, and the tile letter values/counts are our own
// approximation of English letter frequency rather than a lifted table.

export const BOARD_SIZE = 15;
export const CENTER = 7;
export const RACK_SIZE = 7;

export type PremiumType = "DL" | "TL" | "DW" | "TW" | "ST" | null;

// One "octant" of the board (rows/cols 0-7); getPremium mirrors it across
// both axes to fill the full 15x15 symmetric board.
const QUADRANT: PremiumType[][] = [
  ["TW", null, null, "DL", null, null, null, "TL"],
  [null, "DW", null, null, null, "TL", null, null],
  [null, null, "DW", null, null, null, "DL", null],
  ["DL", null, null, "DW", null, null, null, "DL"],
  [null, null, null, null, "DW", null, null, null],
  [null, "TL", null, null, null, "DW", null, null],
  [null, null, "DL", null, null, null, "DW", null],
  ["TL", null, null, "DL", null, null, null, null],
];

export function getPremium(row: number, col: number): PremiumType {
  if (row === CENTER && col === CENTER) return "ST";
  const rr = Math.min(row, BOARD_SIZE - 1 - row);
  const cc = Math.min(col, BOARD_SIZE - 1 - col);
  return QUADRANT[rr]![cc]!;
}

export function letterMultiplier(row: number, col: number): number {
  const p = getPremium(row, col);
  return p === "DL" ? 2 : p === "TL" ? 3 : 1;
}

export function wordMultiplier(row: number, col: number): number {
  const p = getPremium(row, col);
  return p === "DW" || p === "ST" ? 2 : p === "TW" ? 3 : 1;
}

// letter -> { count in the 100-tile bag, point value }
export const TILE_TABLE: Record<string, { count: number; value: number }> = {
  E: { count: 12, value: 1 },
  A: { count: 9, value: 1 },
  I: { count: 9, value: 1 },
  O: { count: 8, value: 1 },
  N: { count: 6, value: 1 },
  R: { count: 6, value: 1 },
  T: { count: 6, value: 1 },
  L: { count: 4, value: 1 },
  S: { count: 4, value: 1 },
  U: { count: 4, value: 1 },
  D: { count: 4, value: 2 },
  G: { count: 3, value: 2 },
  B: { count: 2, value: 3 },
  C: { count: 2, value: 3 },
  M: { count: 2, value: 3 },
  P: { count: 2, value: 3 },
  F: { count: 2, value: 4 },
  H: { count: 2, value: 4 },
  V: { count: 2, value: 4 },
  W: { count: 2, value: 4 },
  Y: { count: 2, value: 4 },
  K: { count: 1, value: 5 },
  J: { count: 1, value: 8 },
  X: { count: 1, value: 8 },
  Q: { count: 1, value: 10 },
  Z: { count: 1, value: 10 },
};
export const BLANK_COUNT = 2;
