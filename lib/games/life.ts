import { GameActionError, GameDefinition, PlayerId } from "@/lib/types";

// A simplified digital take on The Game of Life: spin, move along a fixed
// track, collect salary at payday spaces, and resolve whatever space you
// land on (marriage, kids, a house, a career change, or a random life
// event). Highest net worth when everyone reaches Retire wins.
//
// Simplifications vs. the physical game: no board forks (single track), no
// stock/business spaces, no insurance, and house value doesn't fluctuate.

export type LifeTileKind = "start" | "payday" | "event" | "marry" | "baby" | "house" | "career" | "neutral" | "retire";

const BOARD: LifeTileKind[] = [
  "start", "event", "neutral", "payday", "event", "marry", "event", "payday",
  "career", "event", "baby", "event", "payday", "neutral", "house", "event",
  "payday", "event", "career", "neutral", "baby", "event", "payday", "event",
  "neutral", "payday", "event", "neutral", "event", "payday", "neutral", "event",
  "payday", "event", "neutral", "retire",
];

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
];

const STARTING_CASH = 10000;
const KID_BONUS = 25000;
const MARRIAGE_BONUS = 50000;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

interface LifePlayer {
  id: PlayerId;
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

export interface LifeState {
  hostId: PlayerId;
  order: PlayerId[];
  turnIndex: number;
  players: Record<PlayerId, LifePlayer>;
  phase: "playing" | "finished";
  lastRoll: number | null;
  log: string[];
}

export interface LifeView {
  hostId: PlayerId;
  order: PlayerId[];
  turnIndex: number;
  yourTurn: boolean;
  needsPathChoice: boolean;
  board: LifeTileKind[];
  players: {
    id: PlayerId;
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
  phase: "playing" | "finished";
  lastRoll: number | null;
  log: string[];
}

export type LifeAction = { type: "choosePath"; path: "college" | "career" } | { type: "spin" };

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
      phase: "playing",
      lastRoll: null,
      log: ["The game begins! Choose College or a straight-to-work Career on your first turn."],
    };
  },
  applyAction(state, playerId, action) {
    if (state.phase === "finished") throw new GameActionError("Game is already over.");
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
        case "retire":
          log.push(`${playerId} reached Retirement!`);
          break;
        default:
          break;
      }

      const finished = newPos >= BOARD.length - 1;
      const players = { ...state.players, [playerId]: { ...player, position: newPos, cash, married, kids, house, career, finished } };

      const allFinished = state.order.every((pid) => players[pid]!.finished);
      const nextTurnIndex = allFinished ? state.turnIndex : findNextTurnIndex({ ...state, players }, state.turnIndex);

      return {
        ...state,
        players,
        lastRoll: roll,
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
    return {
      hostId: state.hostId,
      order: state.order,
      turnIndex: state.turnIndex,
      yourTurn: current === playerId && state.phase === "playing",
      needsPathChoice: current === playerId && !you.pathChosen,
      board: BOARD,
      players: state.order.map((pid) => {
        const p = state.players[pid]!;
        return {
          id: p.id,
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
};
