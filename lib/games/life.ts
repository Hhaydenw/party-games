import { GameActionError, GameDefinition, PlayerId } from "@/lib/types";

// A simplified digital take on The Game of Life: pick a car, spin, move
// along a fixed track, collect salary at payday spaces, and resolve
// whatever space you land on (marriage, kids, a house, a career change, a
// lawsuit, the lottery, or a random life event). Highest net worth when
// everyone reaches Retire wins.
//
// Simplifications vs. the physical game: no board forks (single track), no
// stock/business spaces, no insurance, and house value doesn't fluctuate.

export type LifeTileKind = "start" | "payday" | "event" | "marry" | "baby" | "house" | "career" | "lawsuit" | "lottery" | "neutral" | "retire";

const BOARD: LifeTileKind[] = [
  "start", "event", "neutral", "payday", "event", "marry", "event", "payday",
  "career", "event", "baby", "lottery", "payday", "neutral", "house", "event",
  "payday", "lawsuit", "career", "neutral", "baby", "event", "payday", "event",
  "neutral", "payday", "lottery", "neutral", "event", "payday", "lawsuit", "event",
  "payday", "event", "neutral", "retire",
];

export const PIECES = ["🚗", "🚙", "🚕", "🚓", "🏎️", "🚐", "🚌", "🚚"];

interface CareerDef {
  title: string;
  salary: number;
}

const HIGH_CAREERS: CareerDef[] = [
  { title: "Doctor", salary: 18000 },
  { title: "Lawyer", salary: 16000 },
  { title: "Software Developer", salary: 15000 },
  { title: "Pharmacist", salary: 15000 },
  { title: "Engineer", salary: 14000 },
  { title: "Architect", salary: 13000 },
  { title: "Scientist", salary: 13000 },
  { title: "Accountant", salary: 12000 },
];

const LOW_CAREERS: CareerDef[] = [
  { title: "Police Officer", salary: 9000 },
  { title: "Electrician", salary: 9000 },
  { title: "Firefighter", salary: 8500 },
  { title: "Chef", salary: 8000 },
  { title: "Mechanic", salary: 8000 },
  { title: "Teacher", salary: 7000 },
  { title: "Sales Rep", salary: 7000 },
  { title: "Photographer", salary: 6500 },
];

const COLLEGE_TUITION = 50000;

interface HouseDef {
  name: string;
  cost: number;
}

const HOUSES: HouseDef[] = [
  { name: "Cozy Cottage", cost: 80000 },
  { name: "Lakeside Cabin", cost: 100000 },
  { name: "Family Farmhouse", cost: 110000 },
  { name: "Suburban Split-Level", cost: 120000 },
  { name: "Downtown Condo", cost: 140000 },
  { name: "Modern Townhouse", cost: 150000 },
];

interface EventCard {
  text: string;
  amount: number;
}

const EVENT_CARDS: EventCard[] = [
  { text: "You win a cooking contest!", amount: 10000 },
  { text: "Your basement floods — pay for repairs.", amount: -5000 },
  { text: "Tax refund!", amount: 3000 },
  { text: "You throw a wild party.", amount: -2000 },
  { text: "You inherit a small sum from a distant relative.", amount: 15000 },
  { text: "Your car breaks down.", amount: -4000 },
  { text: "You sell an old comic book collection.", amount: 6000 },
  { text: "Speeding ticket.", amount: -1500 },
  { text: "You win the office fantasy football pool.", amount: 2500 },
  { text: "Identity theft! You pay to fix your credit.", amount: -8000 },
  { text: "Garage sale success!", amount: 3500 },
  { text: "You forgot to pay a bill — late fee.", amount: -2000 },
  { text: "Your side hustle takes off.", amount: 7000 },
  { text: "Vet bills for the family dog.", amount: -3000 },
  { text: "You find money in an old coat pocket.", amount: 500 },
  { text: "You get a surprise year-end bonus!", amount: 12000 },
  { text: "A pipe bursts and floods your kitchen.", amount: -6000 },
  { text: "You win a trivia night grand prize.", amount: 4000 },
  { text: "Your flight gets cancelled — rebooking fees.", amount: -1800 },
  { text: "You refinance and save on interest.", amount: 5000 },
  { text: "Your phone falls in the toilet.", amount: -900 },
  { text: "You flip a thrift-store find for a big profit.", amount: 3000 },
  { text: "Your identity is used for a small fraud charge — resolved for a fee.", amount: -2500 },
  { text: "A generous stranger pays for your coffee run all week.", amount: 200 },
  { text: "You get audited but come out even after a small penalty.", amount: -1200 },
  { text: "Your favorite team wins and you cashed in a bet.", amount: 1500 },
  { text: "Your roof needs emergency repairs.", amount: -7000 },
  { text: "You win a raffle at a community fundraiser.", amount: 2000 },
  { text: "You accidentally book two vacations — cancellation fee.", amount: -1000 },
  { text: "Your investment club has a great quarter.", amount: 4500 },
];

const STARTING_CASH = 10000;
const KID_BONUS = 25000;
const MARRIAGE_BONUS = 50000;
const LAWSUIT_AMOUNT = 5000;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

interface LifePlayer {
  id: PlayerId;
  piece: string | null;
  position: number;
  cash: number;
  pathChosen: boolean;
  path: "college" | "career" | null;
  career: CareerDef | null;
  married: boolean;
  kids: number;
  house: HouseDef | null;
  finished: boolean;
}

export type LifePhase = "setup" | "playing" | "finished";

export interface LifeState {
  hostId: PlayerId;
  order: PlayerId[];
  turnIndex: number;
  players: Record<PlayerId, LifePlayer>;
  phase: LifePhase;
  lastRoll: number | null;
  lastMovedPlayerId: PlayerId | null;
  log: string[];
}

export interface LifeView {
  hostId: PlayerId;
  order: PlayerId[];
  turnIndex: number;
  yourTurn: boolean;
  needsPathChoice: boolean;
  yourPiece: string | null;
  availablePieces: string[];
  board: LifeTileKind[];
  players: {
    id: PlayerId;
    piece: string | null;
    position: number;
    cash: number;
    path: "college" | "career" | null;
    career: CareerDef | null;
    married: boolean;
    kids: number;
    house: HouseDef | null;
    finished: boolean;
    netWorth: number;
  }[];
  phase: LifePhase;
  lastRoll: number | null;
  lastMovedPlayerId: PlayerId | null;
  log: string[];
}

export type LifeAction = { type: "choosePiece"; piece: string } | { type: "choosePath"; path: "college" | "career" } | { type: "spin" };

function netWorth(p: LifePlayer): number {
  return p.cash + (p.house?.cost ?? 0) + p.kids * KID_BONUS + (p.married ? MARRIAGE_BONUS : 0);
}

function findNextTurnIndex(state: LifeState, from: number): number {
  for (let step = 1; step <= state.order.length; step++) {
    const idx = (from + step) % state.order.length;
    const pid = state.order[idx]!;
    if (!state.players[pid]!.finished) return idx;
  }
  return from; // everyone finished
}

export const life: GameDefinition<LifeState, LifeView, LifeAction> = {
  meta: {
    id: "life",
    name: "The Game of Life",
    tagline: "Spin, chase your career, start a family, and retire with the most net worth.",
    category: "board",
    minPlayers: 2,
    maxPlayers: 6,
  },
  createInitialState(playersIn) {
    const host = playersIn.find((p) => p.isHost) ?? playersIn[0]!;
    const order = playersIn.map((p) => p.id);
    const players: Record<PlayerId, LifePlayer> = {};
    for (const p of playersIn) {
      players[p.id] = {
        id: p.id,
        piece: null,
        position: 0,
        cash: STARTING_CASH,
        pathChosen: false,
        path: null,
        career: null,
        married: false,
        kids: 0,
        house: null,
        finished: false,
      };
    }
    return {
      hostId: host.id,
      order,
      turnIndex: 0,
      players,
      phase: "setup",
      lastRoll: null,
      lastMovedPlayerId: null,
      log: ["Pick your piece to begin!"],
    };
  },
  applyAction(state, playerId, action) {
    if (state.phase === "finished") throw new GameActionError("Game is already over.");

    if (action.type === "choosePiece") {
      if (state.phase !== "setup") throw new GameActionError("Pieces are locked in once the game starts.");
      if (!PIECES.includes(action.piece)) throw new GameActionError("Invalid piece.");
      const taken = Object.values(state.players).some((p) => p.piece === action.piece);
      if (taken) throw new GameActionError("Someone already picked that piece.");
      const players = { ...state.players, [playerId]: { ...state.players[playerId]!, piece: action.piece } };
      const everyoneReady = state.order.every((pid) => players[pid]!.piece !== null);
      return {
        ...state,
        players,
        phase: everyoneReady ? "playing" : "setup",
        log: everyoneReady
          ? [...state.log, "Everyone's picked their piece — let's go! Choose College or a straight-to-work Career on your first turn."]
          : [...state.log, `${playerId} picked ${action.piece}.`],
      };
    }

    if (state.phase !== "playing") throw new GameActionError("Waiting for everyone to pick a piece.");
    const current = state.order[state.turnIndex]!;
    if (current !== playerId) throw new GameActionError("It's not your turn.");
    const player = state.players[playerId]!;

    if (action.type === "choosePath") {
      if (player.pathChosen) throw new GameActionError("You already chose a path.");
      const players = { ...state.players };
      if (action.path === "college") {
        players[playerId] = { ...player, pathChosen: true, path: "college", career: pick(HIGH_CAREERS), cash: player.cash - COLLEGE_TUITION };
      } else {
        players[playerId] = { ...player, pathChosen: true, path: "career", career: pick(LOW_CAREERS) };
      }
      const chosenCareer = players[playerId]!.career!;
      return {
        ...state,
        players,
        log: [...state.log, `${playerId} chose ${action.path === "college" ? "College" : "Career"} and became a ${chosenCareer.title}.`],
      };
    }

    if (action.type === "spin") {
      if (!player.pathChosen) throw new GameActionError("Choose College or Career first.");
      const roll = 1 + Math.floor(Math.random() * 10);
      const oldPos = player.position;
      const newPos = Math.min(oldPos + roll, BOARD.length - 1);

      let cash = player.cash;
      let married = player.married;
      let kids = player.kids;
      let house = player.house;
      let career = player.career;
      let lawsuitTarget: PlayerId | null = null;
      const log: string[] = [...state.log, `${playerId} spun a ${roll}.`];

      // Collect salary for every payday space passed through or landed on.
      for (let i = oldPos + 1; i <= newPos; i++) {
        if (BOARD[i] === "payday") {
          cash += career!.salary;
          log.push(`${playerId} gets paid $${career!.salary.toLocaleString()}.`);
        }
      }

      const landedKind = BOARD[newPos];
      switch (landedKind) {
        case "marry":
          if (!married) {
            married = true;
            cash += 5000;
            log.push(`${playerId} got married! (+$5,000 in gifts)`);
          }
          break;
        case "baby":
          kids += 1;
          cash += 2000;
          log.push(`${playerId} welcomed a new baby! (+$2,000 in gifts, now ${kids} kid${kids === 1 ? "" : "s"})`);
          break;
        case "house":
          if (!house) {
            house = pick(HOUSES);
            cash -= house.cost;
            log.push(`${playerId} bought a house: ${house.name} (-$${house.cost.toLocaleString()}).`);
          }
          break;
        case "career":
          career = player.path === "college" ? pick(HIGH_CAREERS) : pick(LOW_CAREERS);
          log.push(`${playerId} changed careers — now a ${career.title} ($${career.salary.toLocaleString()}/payday).`);
          break;
        case "event": {
          const card = pick(EVENT_CARDS);
          cash += card.amount;
          log.push(`${playerId}: "${card.text}" (${card.amount >= 0 ? "+" : "-"}$${Math.abs(card.amount).toLocaleString()})`);
          break;
        }
        case "lawsuit": {
          const others = state.order.filter((pid) => pid !== playerId);
          if (others.length > 0) {
            lawsuitTarget = pick(others);
            cash -= LAWSUIT_AMOUNT;
            log.push(`${playerId} is sued and pays $${LAWSUIT_AMOUNT.toLocaleString()} to ${lawsuitTarget}!`);
          }
          break;
        }
        case "lottery": {
          const won = Math.random() < 0.5;
          if (won) {
            cash += 8000;
            log.push(`${playerId} wins the lottery! (+$8,000)`);
          } else {
            cash -= 2000;
            log.push(`${playerId} buys a losing lottery ticket. (-$2,000)`);
          }
          break;
        }
        case "retire":
          log.push(`${playerId} reached Retirement!`);
          break;
        default:
          break;
      }

      const finished = newPos >= BOARD.length - 1;
      let players = { ...state.players, [playerId]: { ...player, position: newPos, cash, married, kids, house, career, finished } };
      if (lawsuitTarget) {
        players = { ...players, [lawsuitTarget]: { ...players[lawsuitTarget]!, cash: players[lawsuitTarget]!.cash + LAWSUIT_AMOUNT } };
      }

      const allFinished = state.order.every((pid) => players[pid]!.finished);
      const nextTurnIndex = allFinished ? state.turnIndex : findNextTurnIndex({ ...state, players }, state.turnIndex);

      return {
        ...state,
        players,
        lastRoll: roll,
        lastMovedPlayerId: playerId,
        turnIndex: nextTurnIndex,
        phase: allFinished ? "finished" : "playing",
        log: log.slice(-40),
      };
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId) {
    const current = state.order[state.turnIndex]!;
    const you = state.players[playerId]!;
    const takenPieces = new Set(Object.values(state.players).map((p) => p.piece).filter((p): p is string => p !== null));
    return {
      hostId: state.hostId,
      order: state.order,
      turnIndex: state.turnIndex,
      yourTurn: current === playerId && state.phase === "playing",
      needsPathChoice: current === playerId && !you.pathChosen,
      yourPiece: you.piece,
      availablePieces: PIECES.filter((p) => !takenPieces.has(p)),
      board: BOARD,
      players: state.order.map((pid) => {
        const p = state.players[pid]!;
        return {
          id: p.id,
          piece: p.piece,
          position: p.position,
          cash: p.cash,
          path: p.path,
          career: p.career,
          married: p.married,
          kids: p.kids,
          house: p.house,
          finished: p.finished,
          netWorth: netWorth(p),
        };
      }),
      phase: state.phase,
      lastRoll: state.lastRoll,
      lastMovedPlayerId: state.lastMovedPlayerId,
      log: state.log.slice(-8),
    };
  },
  isGameOver(state) {
    return state.phase === "finished";
  },
  getWinnerIds(state) {
    if (state.phase !== "finished") return [];
    const values = state.order.map((pid) => [pid, netWorth(state.players[pid]!)] as const);
    const max = Math.max(...values.map(([, v]) => v));
    return values.filter(([, v]) => v === max).map(([pid]) => pid);
  },
  getRanking(state) {
    return [...state.order].sort((a, b) => netWorth(state.players[b]!) - netWorth(state.players[a]!));
  },
};
