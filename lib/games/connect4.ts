import { GameActionError, GameDefinition, PlayerId, PlayerInfo } from "@/lib/types";

const ROWS = 6;
const COLS = 7;

export interface Connect4State {
  board: (PlayerId | null)[][]; // [row][col], row 0 = top
  order: PlayerId[]; // turn order (2 players)
  turnIndex: number;
  winnerId: PlayerId | null;
  isDraw: boolean;
  lastMove: { row: number; col: number } | null;
}

export interface Connect4View extends Connect4State {
  yourTurn: boolean;
}

export type Connect4Action = { type: "drop"; col: number };

function emptyBoard(): (PlayerId | null)[][] {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
}

function checkWinner(board: (PlayerId | null)[][], row: number, col: number): boolean {
  const player = board[row]?.[col];
  if (!player) return false;
  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (const [dr, dc] of dirs) {
    let count = 1;
    for (const sign of [1, -1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r]?.[c] === player) {
        count++;
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (count >= 4) return true;
  }
  return false;
}

export const connect4: GameDefinition<Connect4State, Connect4View, Connect4Action> = {
  meta: {
    id: "connect4",
    name: "Connect Four",
    tagline: "Drop discs, get four in a row before they do.",
    category: "board",
    minPlayers: 2,
    maxPlayers: 2,
  },
  createInitialState(players) {
    const order = players.slice(0, 2).map((p) => p.id);
    return {
      board: emptyBoard(),
      order,
      turnIndex: 0,
      winnerId: null,
      isDraw: false,
      lastMove: null,
    };
  },
  applyAction(state, playerId, action) {
    if (state.winnerId || state.isDraw) throw new GameActionError("Game is already over.");
    const current = state.order[state.turnIndex];
    if (current !== playerId) throw new GameActionError("It's not your turn.");
    if (action.type !== "drop") throw new GameActionError("Unknown action.");
    const { col } = action;
    if (col < 0 || col >= COLS) throw new GameActionError("Invalid column.");

    const board = state.board.map((row) => row.slice());
    let landedRow = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r]?.[col] === null) {
        board[r]![col] = playerId;
        landedRow = r;
        break;
      }
    }
    if (landedRow === -1) throw new GameActionError("That column is full.");

    const won = checkWinner(board, landedRow, col);
    const full = board.every((row) => row.every((cell) => cell !== null));

    return {
      board,
      order: state.order,
      turnIndex: (state.turnIndex + 1) % state.order.length,
      winnerId: won ? playerId : null,
      isDraw: !won && full,
      lastMove: { row: landedRow, col },
    };
  },
  getPlayerView(state, playerId) {
    return { ...state, yourTurn: state.order[state.turnIndex] === playerId && !state.winnerId && !state.isDraw };
  },
  isGameOver(state) {
    return !!state.winnerId || state.isDraw;
  },
  getWinnerIds(state) {
    return state.winnerId ? [state.winnerId] : [];
  },
};
