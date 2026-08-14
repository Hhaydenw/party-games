import { GameActionError, GameDefinition, PlayerId } from "@/lib/types";
import { BLANK_COUNT, BOARD_SIZE, CENTER, RACK_SIZE, TILE_TABLE, letterMultiplier, wordMultiplier } from "@/lib/games/wordGridBoard";

// A Scrabble-style crossword tile game (original name, board layout, and
// tile values — see wordGridBoard.ts's header comment). Word validity is
// checked against a bundled public-domain word list (ENABLE, see
// lib/games/data/wordlist.LICENSE.txt) rather than a live API, so play never
// depends on an external service staying up mid-game.
//
// The dictionary (~1.6MB of words) lives in its own module and is loaded via
// a *dynamic* import rather than a static one at the top of this file. This
// file is reachable from the client bundle (Lobby.tsx renders the game
// picker from lib/games/registry.ts, which imports every game — including
// this one), but the client never actually calls the game engine itself
// (only the server does, via RoomManager); a dynamic import lets bundlers
// split the dictionary into its own chunk that the browser simply never
// fetches, instead of bloating every page load with a word list nobody on
// the client needs.
async function isValidWord(word: string): Promise<boolean> {
  const { getWordSet } = await import("@/lib/games/wordGridDictionary");
  return getWordSet().has(word.toUpperCase());
}

interface BoardCell {
  letter: string;
  value: number;
  isBlank: boolean;
}
type Board = (BoardCell | null)[][];

interface RackTile {
  id: string;
  letter: string; // "" for an undrawn-choice blank sitting in a rack
  value: number;
  isBlank: boolean;
}

function makeEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array<BoardCell | null>(BOARD_SIZE).fill(null));
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

function buildBag(tileSeqStart: number): { bag: RackTile[]; nextSeq: number } {
  let seq = tileSeqStart;
  const tiles: RackTile[] = [];
  for (const [letter, { count, value }] of Object.entries(TILE_TABLE)) {
    for (let i = 0; i < count; i++) {
      seq++;
      tiles.push({ id: `t${seq}`, letter, value, isBlank: false });
    }
  }
  for (let i = 0; i < BLANK_COUNT; i++) {
    seq++;
    tiles.push({ id: `t${seq}`, letter: "", value: 0, isBlank: true });
  }
  return { bag: shuffle(tiles), nextSeq: seq };
}

function draw(bag: RackTile[], count: number): { drawn: RackTile[]; bag: RackTile[] } {
  const drawn = bag.slice(0, count);
  return { drawn, bag: bag.slice(count) };
}

export type WordGridPhase = "playing" | "finished";

export interface WordGridState {
  hostId: PlayerId;
  playerIds: PlayerId[];
  board: Board;
  bag: RackTile[];
  racks: Record<PlayerId, RackTile[]>;
  scores: Record<PlayerId, number>;
  turnIndex: number;
  passStreak: number;
  phase: WordGridPhase;
  log: string[];
  tileSeq: number;
  finishedByEmptyRack: PlayerId | null;
}

export interface BoardCellView {
  letter: string;
  value: number;
  isBlank: boolean;
}

export interface WordGridView {
  hostId: PlayerId;
  board: (BoardCellView | null)[][];
  yourRack: { id: string; letter: string; value: number; isBlank: boolean }[];
  rackSizes: { playerId: PlayerId; size: number }[];
  bagCount: number;
  turnPlayerId: PlayerId;
  isYourTurn: boolean;
  scores: { playerId: PlayerId; score: number }[];
  phase: WordGridPhase;
  log: string[];
  finishedByEmptyRack: PlayerId | null;
  // Revealed once the game ends, purely so everyone can see how the last
  // hands shook out — never leaked mid-game.
  finalRacks: { playerId: PlayerId; letters: string[] }[] | null;
}

export type WordGridPlacement = { row: number; col: number; tileId: string; letter?: string };

export type WordGridAction =
  | { type: "place"; placements: WordGridPlacement[] }
  | { type: "exchange"; tileIds: string[] }
  | { type: "pass" };

function tileValueSum(rack: RackTile[]): number {
  return rack.reduce((sum, t) => sum + t.value, 0);
}

function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

interface FormedWord {
  word: string;
  score: number;
}

interface PlacementResult {
  ok: true;
  board: Board;
  words: FormedWord[];
  totalScore: number;
}
interface PlacementError {
  ok: false;
  error: string;
}

function isFirstMoveEmpty(board: Board): boolean {
  return board.every((row) => row.every((c) => c === null));
}

// Validates a set of tile placements against the current board and, if
// legal, returns the resulting board plus every newly-formed word and its
// score. Never mutates the board/rack passed in.
async function attemptPlacement(board: Board, rack: RackTile[], placements: WordGridPlacement[]): Promise<PlacementResult | PlacementError> {
  if (placements.length === 0) return { ok: false, error: "Place at least one tile." };

  const seenCells = new Set<string>();
  const seenTiles = new Set<string>();
  const usedTiles: RackTile[] = [];
  for (const p of placements) {
    if (p.row < 0 || p.row >= BOARD_SIZE || p.col < 0 || p.col >= BOARD_SIZE) {
      return { ok: false, error: "Placement is off the board." };
    }
    const cellKey = `${p.row},${p.col}`;
    if (seenCells.has(cellKey)) return { ok: false, error: "Can't place two tiles on the same square." };
    seenCells.add(cellKey);
    if (board[p.row]![p.col]) return { ok: false, error: "That square is already occupied." };
    if (seenTiles.has(p.tileId)) return { ok: false, error: "Can't use the same tile twice." };
    seenTiles.add(p.tileId);
    const tile = rack.find((t) => t.id === p.tileId);
    if (!tile) return { ok: false, error: "That tile isn't in your rack." };
    if (tile.isBlank) {
      const chosen = (p.letter ?? "").toUpperCase();
      if (!/^[A-Z]$/.test(chosen)) return { ok: false, error: "Pick a letter for your blank tile." };
      usedTiles.push({ ...tile, letter: chosen });
    } else {
      usedTiles.push(tile);
    }
  }

  const firstMove = isFirstMoveEmpty(board);

  // Orientation: all same row (horizontal), all same col (vertical), or a
  // single tile (checked in both directions below).
  const rows = new Set(placements.map((p) => p.row));
  const cols = new Set(placements.map((p) => p.col));
  let orientation: "horizontal" | "vertical" | null = null;
  if (placements.length > 1) {
    if (rows.size === 1) orientation = "horizontal";
    else if (cols.size === 1) orientation = "vertical";
    else return { ok: false, error: "Tiles must form a single row or column." };
  }

  const merged = cloneBoard(board);
  const newCellKeys = new Set<string>();
  placements.forEach((p, i) => {
    const tile = usedTiles[i]!;
    merged[p.row]![p.col] = { letter: tile.letter, value: tile.value, isBlank: tile.isBlank };
    newCellKeys.add(`${p.row},${p.col}`);
  });

  // Gap check along the forced axis (multi-tile plays only) — every square
  // between the min and max placed index must now be filled.
  if (orientation === "horizontal") {
    const row = placements[0]!.row;
    const colsPlaced = placements.map((p) => p.col);
    const min = Math.min(...colsPlaced);
    const max = Math.max(...colsPlaced);
    for (let c = min; c <= max; c++) {
      if (!merged[row]![c]) return { ok: false, error: "Your tiles must be in one unbroken line." };
    }
  } else if (orientation === "vertical") {
    const col = placements[0]!.col;
    const rowsPlaced = placements.map((p) => p.row);
    const min = Math.min(...rowsPlaced);
    const max = Math.max(...rowsPlaced);
    for (let r = min; r <= max; r++) {
      if (!merged[r]![col]) return { ok: false, error: "Your tiles must be in one unbroken line." };
    }
  }

  function scanRun(row: number, col: number, dr: number, dc: number): { cells: { row: number; col: number }[]; hasNew: boolean } {
    // Walk to the start of the contiguous run, then read it forward.
    let r = row;
    let c = col;
    while (merged[r - dr]?.[c - dc]) {
      r -= dr;
      c -= dc;
    }
    const cells: { row: number; col: number }[] = [];
    let hasNew = false;
    while (merged[r]?.[c]) {
      cells.push({ row: r, col: c });
      if (newCellKeys.has(`${r},${c}`)) hasNew = true;
      r += dr;
      c += dc;
    }
    return { cells, hasNew };
  }

  const words: { cells: { row: number; col: number }[] }[] = [];
  const wordCellSetKeys = new Set<string>();
  function addWordIfNew(cells: { row: number; col: number }[]) {
    if (cells.length < 2) return;
    const key = cells.map((c) => `${c.row},${c.col}`).join("|");
    if (wordCellSetKeys.has(key)) return;
    wordCellSetKeys.add(key);
    words.push({ cells });
  }

  if (orientation === "horizontal") {
    const row = placements[0]!.row;
    addWordIfNew(scanRun(row, placements[0]!.col, 0, 1).cells);
    for (const p of placements) addWordIfNew(scanRun(p.row, p.col, 1, 0).cells);
  } else if (orientation === "vertical") {
    const col = placements[0]!.col;
    addWordIfNew(scanRun(placements[0]!.row, col, 1, 0).cells);
    for (const p of placements) addWordIfNew(scanRun(p.row, p.col, 0, 1).cells);
  } else {
    // Single tile — check both directions through the one placed cell.
    const p = placements[0]!;
    addWordIfNew(scanRun(p.row, p.col, 0, 1).cells);
    addWordIfNew(scanRun(p.row, p.col, 1, 0).cells);
  }

  if (words.length === 0) {
    return {
      ok: false,
      error: firstMove
        ? "The first play must form a full word (2+ letters) through the center square."
        : "Doesn't form a word — connect to an existing word on the board.",
    };
  }

  if (firstMove) {
    if (!newCellKeys.has(`${CENTER},${CENTER}`)) return { ok: false, error: "The first play must cover the center square." };
  } else {
    const touchesExisting = words.some((w) => w.cells.some((c) => !newCellKeys.has(`${c.row},${c.col}`)));
    if (!touchesExisting) return { ok: false, error: "Must connect to an existing word on the board." };
  }

  const formed: FormedWord[] = [];
  let totalScore = 0;
  for (const w of words) {
    let letterSum = 0;
    let wordMult = 1;
    let text = "";
    for (const { row, col } of w.cells) {
      const cell = merged[row]![col]!;
      text += cell.letter;
      const isNew = newCellKeys.has(`${row},${col}`);
      letterSum += cell.value * (isNew ? letterMultiplier(row, col) : 1);
      if (isNew) wordMult *= wordMultiplier(row, col);
    }
    if (!(await isValidWord(text))) return { ok: false, error: `"${text}" isn't a recognized word.` };
    const score = letterSum * wordMult;
    formed.push({ word: text, score });
    totalScore += score;
  }

  if (placements.length === RACK_SIZE) totalScore += 50; // used the whole rack this turn

  return { ok: true, board: merged, words: formed, totalScore };
}

function nextTurn(state: WordGridState): number {
  return (state.turnIndex + 1) % state.playerIds.length;
}

function endGame(state: WordGridState, emptyRackPlayerId: PlayerId | null): WordGridState {
  const scores = { ...state.scores };
  if (emptyRackPlayerId) {
    let bonus = 0;
    for (const pid of state.playerIds) {
      if (pid === emptyRackPlayerId) continue;
      const leftover = tileValueSum(state.racks[pid] ?? []);
      scores[pid] = (scores[pid] ?? 0) - leftover;
      bonus += leftover;
    }
    scores[emptyRackPlayerId] = (scores[emptyRackPlayerId] ?? 0) + bonus;
  } else {
    for (const pid of state.playerIds) {
      scores[pid] = (scores[pid] ?? 0) - tileValueSum(state.racks[pid] ?? []);
    }
  }
  return { ...state, phase: "finished", scores, finishedByEmptyRack: emptyRackPlayerId };
}

export const wordGrid: GameDefinition<WordGridState, WordGridView, WordGridAction> = {
  meta: {
    id: "word-grid",
    name: "Word Grid",
    tagline: "Scrabble-style crossword battle — lay tiles across a shared board, biggest words win.",
    category: "board",
    minPlayers: 2,
    maxPlayers: 4,
  },
  createInitialState(players) {
    const host = players.find((p) => p.isHost) ?? players[0]!;
    const { bag: fullBag, nextSeq } = buildBag(0);
    let bag = fullBag;
    const racks: Record<PlayerId, RackTile[]> = {};
    const scores: Record<PlayerId, number> = {};
    for (const p of players) {
      const { drawn, bag: rest } = draw(bag, RACK_SIZE);
      racks[p.id] = drawn;
      bag = rest;
      scores[p.id] = 0;
    }
    return {
      hostId: host.id,
      playerIds: players.map((p) => p.id),
      board: makeEmptyBoard(),
      bag,
      racks,
      scores,
      turnIndex: 0,
      passStreak: 0,
      phase: "playing",
      log: [`${players[0]?.name ?? "Someone"} goes first — cover the center square to open the game!`],
      tileSeq: nextSeq,
      finishedByEmptyRack: null,
    };
  },
  async applyAction(state, playerId, action) {
    if (state.phase !== "playing") throw new GameActionError("Game is already over.");
    if (state.playerIds[state.turnIndex] !== playerId) throw new GameActionError("Not your turn.");
    const rack = state.racks[playerId] ?? [];
    // Log lines embed the raw player id (state has no access to display
    // names); getPlayerView substitutes ids for names when building its
    // readable log, since names live on the room's player list, not state.

    if (action.type === "place") {
      const result = await attemptPlacement(state.board, rack, action.placements);
      if (!result.ok) throw new GameActionError(result.error);
      const usedIds = new Set(action.placements.map((p) => p.tileId));
      const remainingRack = rack.filter((t) => !usedIds.has(t.id));
      const needed = RACK_SIZE - remainingRack.length;
      const { drawn, bag } = draw(state.bag, Math.max(0, needed));
      const newRack = [...remainingRack, ...drawn];
      const racks = { ...state.racks, [playerId]: newRack };
      const scores = { ...state.scores, [playerId]: (state.scores[playerId] ?? 0) + result.totalScore };
      const wordList = result.words.map((w) => `${w.word} (${w.score})`).join(", ");
      const log = [...state.log, `${playerId} played ${wordList} for ${result.totalScore} pts.`].slice(-30);
      let next: WordGridState = {
        ...state,
        board: result.board,
        racks,
        bag,
        scores,
        passStreak: 0,
        log,
        turnIndex: nextTurn(state),
      };
      if (newRack.length === 0 && bag.length === 0) {
        next = endGame(next, playerId);
      }
      return next;
    }

    if (action.type === "exchange") {
      if (action.tileIds.length === 0) throw new GameActionError("Pick at least one tile to exchange.");
      if (state.bag.length < action.tileIds.length) throw new GameActionError("Not enough tiles left in the bag to exchange that many.");
      const idSet = new Set(action.tileIds);
      if (idSet.size !== action.tileIds.length) throw new GameActionError("Duplicate tile in exchange request.");
      const toExchange = rack.filter((t) => idSet.has(t.id));
      if (toExchange.length !== action.tileIds.length) throw new GameActionError("Those tiles aren't all in your rack.");
      const keep = rack.filter((t) => !idSet.has(t.id));
      const bagWithReturns = shuffle([...state.bag, ...toExchange]);
      const { drawn, bag } = draw(bagWithReturns, toExchange.length);
      const racks = { ...state.racks, [playerId]: [...keep, ...drawn] };
      const log = [...state.log, `${playerId} exchanged ${toExchange.length} tile${toExchange.length === 1 ? "" : "s"}.`].slice(-30);
      return { ...state, racks, bag, passStreak: 0, log, turnIndex: nextTurn(state) };
    }

    if (action.type === "pass") {
      const passStreak = state.passStreak + 1;
      const log = [...state.log, `${playerId} passed.`].slice(-30);
      let next: WordGridState = { ...state, passStreak, log, turnIndex: nextTurn(state) };
      if (passStreak >= state.playerIds.length) next = endGame(next, null);
      return next;
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId, players) {
    const nameOf = (pid: PlayerId) => players.find((p) => p.id === pid)?.name ?? pid;
    const boardView: (BoardCellView | null)[][] = state.board.map((row) => row.map((c) => (c ? { letter: c.letter, value: c.value, isBlank: c.isBlank } : null)));
    // Turn-log entries reference raw player ids; resolve them to names here
    // rather than baking names into state (state has no access to display
    // names, only the room's player list does, and names can change).
    const readableLog = state.log.map((line) => {
      let out = line;
      for (const pid of state.playerIds) out = out.split(pid).join(nameOf(pid));
      return out;
    });
    return {
      hostId: state.hostId,
      board: boardView,
      yourRack: (state.racks[playerId] ?? []).map((t) => ({ id: t.id, letter: t.letter, value: t.value, isBlank: t.isBlank })),
      rackSizes: state.playerIds.map((pid) => ({ playerId: pid, size: (state.racks[pid] ?? []).length })),
      bagCount: state.bag.length,
      turnPlayerId: state.playerIds[state.turnIndex]!,
      isYourTurn: state.playerIds[state.turnIndex] === playerId,
      scores: state.playerIds.map((pid) => ({ playerId: pid, score: state.scores[pid] ?? 0 })),
      phase: state.phase,
      log: readableLog,
      finishedByEmptyRack: state.finishedByEmptyRack,
      finalRacks:
        state.phase === "finished"
          ? state.playerIds.map((pid) => ({ playerId: pid, letters: (state.racks[pid] ?? []).map((t) => (t.isBlank ? "?" : t.letter)) }))
          : null,
    };
  },
  isGameOver(state) {
    return state.phase === "finished";
  },
  getWinnerIds(state) {
    if (state.phase !== "finished") return [];
    const max = Math.max(...Object.values(state.scores));
    return Object.entries(state.scores)
      .filter(([, v]) => v === max)
      .map(([k]) => k);
  },
  getRanking(state) {
    return [...state.playerIds].sort((a, b) => (state.scores[b] ?? 0) - (state.scores[a] ?? 0));
  },
};
