import { GameActionError, GameDefinition, PlayerId } from "@/lib/types";

// A simplified digital Monopoly: full board, buying, rent (including
// monopoly/house/hotel/railroad/utility rules), Chance & Community Chest,
// jail, mortgaging, and bankruptcy.
//
// Deliberately out of scope for this version: player-to-player trading (a
// full offer/counter-offer negotiation UI is its own project), property
// auctions when a purchase is declined, and the "even building" house rule.
// The host can also force-end the game at any time and the richest player
// (cash + property value) wins — handy since real Monopoly games can run
// long at a party.

export type PropertyColor = "brown" | "lightblue" | "pink" | "orange" | "red" | "yellow" | "green" | "darkblue";

interface PropertyTileDef {
  type: "property";
  name: string;
  color: PropertyColor;
  price: number;
  houseCost: number;
  rent: [number, number, number, number, number, number]; // 0,1,2,3,4 houses, hotel
}
interface RailroadTileDef {
  type: "railroad";
  name: string;
  price: number;
}
interface UtilityTileDef {
  type: "utility";
  name: string;
  price: number;
}
interface TaxTileDef {
  type: "tax";
  name: string;
  amount: number;
}
interface SimpleTileDef {
  type: "go" | "chance" | "chest" | "jail" | "goToJail" | "freeParking";
  name: string;
}
export type TileDef = PropertyTileDef | RailroadTileDef | UtilityTileDef | TaxTileDef | SimpleTileDef;

export const BOARD: TileDef[] = [
  { type: "go", name: "GO" },
  { type: "property", name: "Mediterranean Avenue", color: "brown", price: 60, houseCost: 50, rent: [2, 10, 30, 90, 160, 250] },
  { type: "chest", name: "Community Chest" },
  { type: "property", name: "Baltic Avenue", color: "brown", price: 60, houseCost: 50, rent: [4, 20, 60, 180, 320, 450] },
  { type: "tax", name: "Income Tax", amount: 200 },
  { type: "railroad", name: "Reading Railroad", price: 200 },
  { type: "property", name: "Oriental Avenue", color: "lightblue", price: 100, houseCost: 50, rent: [6, 30, 90, 270, 400, 550] },
  { type: "chance", name: "Chance" },
  { type: "property", name: "Vermont Avenue", color: "lightblue", price: 100, houseCost: 50, rent: [6, 30, 90, 270, 400, 550] },
  { type: "property", name: "Connecticut Avenue", color: "lightblue", price: 120, houseCost: 50, rent: [8, 40, 100, 300, 450, 600] },
  { type: "jail", name: "Jail" },
  { type: "property", name: "St. Charles Place", color: "pink", price: 140, houseCost: 100, rent: [10, 50, 150, 450, 625, 750] },
  { type: "utility", name: "Electric Company", price: 150 },
  { type: "property", name: "States Avenue", color: "pink", price: 140, houseCost: 100, rent: [10, 50, 150, 450, 625, 750] },
  { type: "property", name: "Virginia Avenue", color: "pink", price: 160, houseCost: 100, rent: [12, 60, 180, 500, 700, 900] },
  { type: "railroad", name: "Pennsylvania Railroad", price: 200 },
  { type: "property", name: "St. James Place", color: "orange", price: 180, houseCost: 100, rent: [14, 70, 200, 550, 750, 950] },
  { type: "chest", name: "Community Chest" },
  { type: "property", name: "Tennessee Avenue", color: "orange", price: 180, houseCost: 100, rent: [14, 70, 200, 550, 750, 950] },
  { type: "property", name: "New York Avenue", color: "orange", price: 200, houseCost: 100, rent: [16, 80, 220, 600, 800, 1000] },
  { type: "freeParking", name: "Free Parking" },
  { type: "property", name: "Kentucky Avenue", color: "red", price: 220, houseCost: 150, rent: [18, 90, 250, 700, 875, 1050] },
  { type: "chance", name: "Chance" },
  { type: "property", name: "Indiana Avenue", color: "red", price: 220, houseCost: 150, rent: [18, 90, 250, 700, 875, 1050] },
  { type: "property", name: "Illinois Avenue", color: "red", price: 240, houseCost: 150, rent: [20, 100, 300, 750, 925, 1100] },
  { type: "railroad", name: "B&O Railroad", price: 200 },
  { type: "property", name: "Atlantic Avenue", color: "yellow", price: 260, houseCost: 150, rent: [22, 110, 330, 800, 975, 1150] },
  { type: "property", name: "Ventnor Avenue", color: "yellow", price: 260, houseCost: 150, rent: [22, 110, 330, 800, 975, 1150] },
  { type: "utility", name: "Water Works", price: 150 },
  { type: "property", name: "Marvin Gardens", color: "yellow", price: 280, houseCost: 150, rent: [24, 120, 360, 850, 1025, 1200] },
  { type: "goToJail", name: "Go To Jail" },
  { type: "property", name: "Pacific Avenue", color: "green", price: 300, houseCost: 200, rent: [26, 130, 390, 900, 1100, 1275] },
  { type: "property", name: "North Carolina Avenue", color: "green", price: 300, houseCost: 200, rent: [26, 130, 390, 900, 1100, 1275] },
  { type: "chest", name: "Community Chest" },
  { type: "property", name: "Pennsylvania Avenue", color: "green", price: 320, houseCost: 200, rent: [28, 150, 450, 1000, 1200, 1400] },
  { type: "railroad", name: "Short Line", price: 200 },
  { type: "chance", name: "Chance" },
  { type: "property", name: "Park Place", color: "darkblue", price: 350, houseCost: 200, rent: [35, 175, 500, 1100, 1300, 1500] },
  { type: "tax", name: "Luxury Tax", amount: 100 },
  { type: "property", name: "Boardwalk", color: "darkblue", price: 400, houseCost: 200, rent: [50, 200, 600, 1400, 1700, 2000] },
];

const JAIL_INDEX = 10;
const GO_TO_JAIL_INDEX = 30;
const STARTING_CASH = 1500;
const GO_BONUS = 200;

type CardEffect =
  | { kind: "collect"; amount: number }
  | { kind: "pay"; amount: number }
  | { kind: "moveTo"; tileIndex: number }
  | { kind: "moveBy"; delta: number }
  | { kind: "goToJail" }
  | { kind: "getOutOfJailFree" }
  | { kind: "payEachPlayer"; amount: number }
  | { kind: "collectFromEachPlayer"; amount: number }
  | { kind: "repairs"; perHouse: number; perHotel: number };

interface Card {
  text: string;
  effect: CardEffect;
}

const CHANCE_CARDS: Card[] = [
  { text: "Advance to GO. Collect $200.", effect: { kind: "moveTo", tileIndex: 0 } },
  { text: "Bank pays you a dividend of $50.", effect: { kind: "collect", amount: 50 } },
  { text: "Get Out of Jail Free.", effect: { kind: "getOutOfJailFree" } },
  { text: "Go back 3 spaces.", effect: { kind: "moveBy", delta: -3 } },
  { text: "Go directly to Jail.", effect: { kind: "goToJail" } },
  { text: "Make general repairs: pay $25 per house, $100 per hotel.", effect: { kind: "repairs", perHouse: 25, perHotel: 100 } },
  { text: "Pay poor tax of $15.", effect: { kind: "pay", amount: 15 } },
  { text: "Take a trip to Boardwalk.", effect: { kind: "moveTo", tileIndex: 39 } },
  { text: "You are elected Chairman — pay each player $50.", effect: { kind: "payEachPlayer", amount: 50 } },
  { text: "Your building loan matures. Collect $150.", effect: { kind: "collect", amount: 150 } },
  { text: "You've won a crossword competition. Collect $100.", effect: { kind: "collect", amount: 100 } },
];

const CHEST_CARDS: Card[] = [
  { text: "Advance to GO. Collect $200.", effect: { kind: "moveTo", tileIndex: 0 } },
  { text: "Bank error in your favor. Collect $200.", effect: { kind: "collect", amount: 200 } },
  { text: "Doctor's fees — pay $50.", effect: { kind: "pay", amount: 50 } },
  { text: "From sale of stock, you get $50.", effect: { kind: "collect", amount: 50 } },
  { text: "Get Out of Jail Free.", effect: { kind: "getOutOfJailFree" } },
  { text: "Go directly to Jail.", effect: { kind: "goToJail" } },
  { text: "Holiday fund matures. Collect $100.", effect: { kind: "collect", amount: 100 } },
  { text: "Income tax refund. Collect $20.", effect: { kind: "collect", amount: 20 } },
  { text: "It's your birthday — collect $10 from every player.", effect: { kind: "collectFromEachPlayer", amount: 10 } },
  { text: "Pay hospital fees of $100.", effect: { kind: "pay", amount: 100 } },
  { text: "Pay school fees of $50.", effect: { kind: "pay", amount: 50 } },
  { text: "Receive $25 consultancy fee.", effect: { kind: "collect", amount: 25 } },
  { text: "Street repairs — pay $40 per house, $115 per hotel.", effect: { kind: "repairs", perHouse: 40, perHotel: 115 } },
  { text: "You inherit $100.", effect: { kind: "collect", amount: 100 } },
];

interface MonopolyPlayer {
  id: PlayerId;
  position: number;
  cash: number;
  properties: number[];
  houses: Record<number, number>; // tileIndex -> 0-4 houses, 5 = hotel
  mortgaged: number[];
  inJail: boolean;
  jailTurns: number;
  jailCards: number;
  bankrupt: boolean;
}

export type MonopolyPhase = "awaitingRoll" | "awaitingPropertyDecision" | "awaitingTurnEnd" | "finished";

export interface MonopolyState {
  hostId: PlayerId;
  order: PlayerId[];
  turnIndex: number;
  players: Record<PlayerId, MonopolyPlayer>;
  phase: MonopolyPhase;
  pendingPropertyIndex: number | null;
  lastRoll: [number, number] | null;
  doublesStreak: number;
  turnCount: number;
  log: string[];
}

export interface MonopolyPropertyView {
  index: number;
  name: string;
  color?: PropertyColor;
  price?: number;
  ownerId: PlayerId | null;
  houses: number;
  mortgaged: boolean;
}

export interface MonopolyView {
  hostId: PlayerId;
  order: PlayerId[];
  turnIndex: number;
  yourTurn: boolean;
  phase: MonopolyPhase;
  pendingPropertyIndex: number | null;
  lastRoll: [number, number] | null;
  board: { type: TileDef["type"]; name: string; color?: PropertyColor; price?: number }[];
  properties: MonopolyPropertyView[];
  players: {
    id: PlayerId;
    position: number;
    cash: number;
    propertyCount: number;
    inJail: boolean;
    jailCards: number;
    bankrupt: boolean;
    netWorth: number;
  }[];
  log: string[];
}

export type MonopolyAction =
  | { type: "roll" }
  | { type: "payBail" }
  | { type: "useJailCard" }
  | { type: "buyProperty" }
  | { type: "declineProperty" }
  | { type: "buildHouse"; propertyIndex: number }
  | { type: "sellHouse"; propertyIndex: number }
  | { type: "mortgageProperty"; propertyIndex: number }
  | { type: "unmortgageProperty"; propertyIndex: number }
  | { type: "endTurn" }
  | { type: "endGame" };

function isOwnable(tile: TileDef): tile is PropertyTileDef | RailroadTileDef | UtilityTileDef {
  return tile.type === "property" || tile.type === "railroad" || tile.type === "utility";
}

function priceOf(tile: TileDef): number {
  return isOwnable(tile) ? tile.price : 0;
}

function ownerOf(state: MonopolyState, tileIndex: number): PlayerId | null {
  for (const pid of state.order) {
    if (state.players[pid]!.properties.includes(tileIndex)) return pid;
  }
  return null;
}

function colorGroupIndices(color: PropertyColor): number[] {
  const out: number[] = [];
  BOARD.forEach((t, i) => {
    if (t.type === "property" && t.color === color) out.push(i);
  });
  return out;
}

function computeRent(state: MonopolyState, tileIndex: number, ownerId: PlayerId, diceSum: number): number {
  const tile = BOARD[tileIndex]!;
  const owner = state.players[ownerId]!;
  if (owner.mortgaged.includes(tileIndex)) return 0;
  if (tile.type === "property") {
    const houses = owner.houses[tileIndex] ?? 0;
    if (houses > 0) return tile.rent[houses]!;
    const ownsAll = colorGroupIndices(tile.color).every((i) => owner.properties.includes(i));
    return ownsAll ? tile.rent[0]! * 2 : tile.rent[0]!;
  }
  if (tile.type === "railroad") {
    const count = BOARD.reduce((n, t, i) => (t.type === "railroad" && owner.properties.includes(i) ? n + 1 : n), 0);
    return [0, 25, 50, 100, 200][count] ?? 0;
  }
  if (tile.type === "utility") {
    const count = BOARD.reduce((n, t, i) => (t.type === "utility" && owner.properties.includes(i) ? n + 1 : n), 0);
    return diceSum * (count >= 2 ? 10 : 4);
  }
  return 0;
}

function netWorth(state: MonopolyState, playerId: PlayerId): number {
  const p = state.players[playerId]!;
  let total = p.cash;
  for (const idx of p.properties) {
    const tile = BOARD[idx]!;
    const price = priceOf(tile);
    total += p.mortgaged.includes(idx) ? price / 2 : price;
    if (tile.type === "property") {
      const houses = p.houses[idx] ?? 0;
      total += houses * tile.houseCost;
    }
  }
  return total;
}

function findNextTurnIndex(state: MonopolyState, from: number): number {
  for (let step = 1; step <= state.order.length; step++) {
    const idx = (from + step) % state.order.length;
    if (!state.players[state.order[idx]!]!.bankrupt) return idx;
  }
  return from;
}

function checkForSingleSurvivor(state: MonopolyState): MonopolyState {
  const alive = state.order.filter((pid) => !state.players[pid]!.bankrupt);
  if (alive.length <= 1) return { ...state, phase: "finished" };
  return state;
}

// Deducts `amount` from `payerId`'s cash (crediting `payeeId` if given, else
// the bank) and marks them bankrupt if that pushes them below zero, releasing
// their properties back to the bank.
function pay(state: MonopolyState, payerId: PlayerId, payeeId: PlayerId | null, amount: number, log: string[]): MonopolyState {
  const players = { ...state.players };
  const payer = { ...players[payerId]! };
  payer.cash -= amount;
  if (payeeId) {
    players[payeeId] = { ...players[payeeId]!, cash: players[payeeId]!.cash + amount };
  }
  if (payer.cash < 0) {
    payer.bankrupt = true;
    log.push(`${payerId} went bankrupt!`);
    // Properties simply return to the bank; the payee does not inherit them.
    payer.properties = [];
    payer.houses = {};
    payer.mortgaged = [];
  }
  players[payerId] = payer;
  return { ...state, players, log };
}

function applyCard(state: MonopolyState, playerId: PlayerId, card: Card, log: string[]): MonopolyState {
  log.push(`${playerId} drew: ${card.text}`);
  const effect = card.effect;
  let s = state;
  const player = s.players[playerId]!;

  switch (effect.kind) {
    case "collect": {
      const players = { ...s.players, [playerId]: { ...player, cash: player.cash + effect.amount } };
      return { ...s, players, log };
    }
    case "pay":
      return pay(s, playerId, null, effect.amount, log);
    case "moveTo": {
      const passedGo = effect.tileIndex < player.position;
      const cash = player.cash + (passedGo ? GO_BONUS : 0);
      const players = { ...s.players, [playerId]: { ...player, position: effect.tileIndex, cash } };
      s = { ...s, players, log };
      return resolveLanding(s, playerId, 0, log);
    }
    case "moveBy": {
      const newPos = (player.position + effect.delta + BOARD.length) % BOARD.length;
      const players = { ...s.players, [playerId]: { ...player, position: newPos } };
      s = { ...s, players, log };
      return resolveLanding(s, playerId, 0, log);
    }
    case "goToJail": {
      const players = { ...s.players, [playerId]: { ...player, position: JAIL_INDEX, inJail: true } };
      return { ...s, players, log };
    }
    case "getOutOfJailFree": {
      const players = { ...s.players, [playerId]: { ...player, jailCards: player.jailCards + 1 } };
      return { ...s, players, log };
    }
    case "payEachPlayer": {
      for (const otherId of s.order) {
        if (otherId === playerId || s.players[otherId]!.bankrupt) continue;
        s = pay(s, playerId, otherId, effect.amount, log);
        if (s.players[playerId]!.bankrupt) break;
      }
      return s;
    }
    case "collectFromEachPlayer": {
      for (const otherId of s.order) {
        if (otherId === playerId || s.players[otherId]!.bankrupt) continue;
        s = pay(s, otherId, playerId, effect.amount, log);
      }
      return s;
    }
    case "repairs": {
      let total = 0;
      for (const idx of player.properties) {
        const houses = player.houses[idx] ?? 0;
        total += houses === 5 ? effect.perHotel : houses * effect.perHouse;
      }
      return pay(s, playerId, null, total, log);
    }
  }
}

// Resolves whatever the player's current tile does. `diceSum` is used for
// utility rent; pass 0 for card-driven teleports (utility rent from a card
// move is a rare edge case we don't model).
function resolveLanding(state: MonopolyState, playerId: PlayerId, diceSum: number, log: string[]): MonopolyState {
  const player = state.players[playerId]!;
  const tile = BOARD[player.position]!;

  if (tile.type === "goToJail") {
    const players = { ...state.players, [playerId]: { ...player, position: JAIL_INDEX, inJail: true } };
    log.push(`${playerId} was sent to Jail.`);
    return { ...state, players, log };
  }

  if (tile.type === "tax") {
    log.push(`${playerId} pays ${tile.name}: $${tile.amount}.`);
    return pay(state, playerId, null, tile.amount, log);
  }

  if (tile.type === "chance" || tile.type === "chest") {
    const deck = tile.type === "chance" ? CHANCE_CARDS : CHEST_CARDS;
    const card = deck[Math.floor(Math.random() * deck.length)]!;
    return applyCard(state, playerId, card, log);
  }

  if (isOwnable(tile)) {
    const owner = ownerOf(state, player.position);
    if (!owner) {
      return { ...state, phase: "awaitingPropertyDecision", pendingPropertyIndex: player.position, log };
    }
    if (owner === playerId) {
      return { ...state, log };
    }
    const rent = computeRent(state, player.position, owner, diceSum);
    log.push(`${playerId} pays $${rent} rent to ${owner} for ${tile.name}.`);
    return pay(state, playerId, owner, rent, log);
  }

  return { ...state, log };
}

export const monopoly: GameDefinition<MonopolyState, MonopolyView, MonopolyAction> = {
  meta: {
    id: "monopoly",
    name: "Monopoly",
    tagline: "Buy properties, build houses and hotels, and bankrupt your friends.",
    category: "board",
    minPlayers: 2,
    maxPlayers: 6,
  },
  createInitialState(playersIn) {
    const host = playersIn.find((p) => p.isHost) ?? playersIn[0]!;
    const order = playersIn.map((p) => p.id);
    const players: Record<PlayerId, MonopolyPlayer> = {};
    for (const p of playersIn) {
      players[p.id] = {
        id: p.id,
        position: 0,
        cash: STARTING_CASH,
        properties: [],
        houses: {},
        mortgaged: [],
        inJail: false,
        jailTurns: 0,
        jailCards: 0,
        bankrupt: false,
      };
    }
    return {
      hostId: host.id,
      order,
      turnIndex: 0,
      players,
      phase: "awaitingRoll",
      pendingPropertyIndex: null,
      lastRoll: null,
      doublesStreak: 0,
      turnCount: 0,
      log: ["Game started! Everyone begins with $1,500."],
    };
  },
  applyAction(state, playerId, action) {
    if (state.phase === "finished") throw new GameActionError("Game is already over.");

    if (action.type === "endGame") {
      if (playerId !== state.hostId) throw new GameActionError("Only the host can end the game.");
      return { ...state, phase: "finished" };
    }

    const current = state.order[state.turnIndex]!;
    if (current !== playerId) throw new GameActionError("It's not your turn.");
    const player = state.players[playerId]!;
    const log = [...state.log];

    if (action.type === "payBail") {
      if (state.phase !== "awaitingRoll" || !player.inJail) throw new GameActionError("You're not in jail.");
      if (player.cash < 50) throw new GameActionError("Not enough cash to pay bail.");
      let s = pay(state, playerId, null, 50, log);
      if (s.players[playerId]!.bankrupt) return checkForSingleSurvivor(s);
      s = { ...s, players: { ...s.players, [playerId]: { ...s.players[playerId]!, inJail: false, jailTurns: 0 } } };
      return s;
    }

    if (action.type === "useJailCard") {
      if (state.phase !== "awaitingRoll" || !player.inJail) throw new GameActionError("You're not in jail.");
      if (player.jailCards < 1) throw new GameActionError("You don't have a Get Out of Jail Free card.");
      const players = { ...state.players, [playerId]: { ...player, inJail: false, jailTurns: 0, jailCards: player.jailCards - 1 } };
      return { ...state, players, log: [...log, `${playerId} used a Get Out of Jail Free card.`] };
    }

    if (action.type === "roll") {
      if (state.phase !== "awaitingRoll") throw new GameActionError("You can't roll right now.");
      const d1 = 1 + Math.floor(Math.random() * 6);
      const d2 = 1 + Math.floor(Math.random() * 6);
      const doubles = d1 === d2;
      log.push(`${playerId} rolled ${d1} + ${d2}${doubles ? " (doubles!)" : ""}.`);

      if (player.inJail) {
        if (doubles) {
          const newPos = (player.position + d1 + d2) % BOARD.length;
          const cash = player.cash + (newPos < player.position ? GO_BONUS : 0);
          const players = { ...state.players, [playerId]: { ...player, inJail: false, jailTurns: 0, position: newPos, cash } };
          log.push(`${playerId} rolled doubles and got out of jail!`);
          let s: MonopolyState = { ...state, players, lastRoll: [d1, d2], log };
          s = resolveLanding(s, playerId, d1 + d2, s.log);
          if (s.players[playerId]!.bankrupt) return checkForSingleSurvivor({ ...s, phase: "awaitingTurnEnd" });
          return { ...s, phase: s.phase === "awaitingPropertyDecision" ? s.phase : "awaitingTurnEnd" };
        }
        const jailTurns = player.jailTurns + 1;
        if (jailTurns >= 3) {
          let s = pay(state, playerId, null, 50, log);
          if (s.players[playerId]!.bankrupt) return checkForSingleSurvivor({ ...s, phase: "awaitingTurnEnd", lastRoll: [d1, d2] });
          s = { ...s, players: { ...s.players, [playerId]: { ...s.players[playerId]!, inJail: false, jailTurns: 0 } } };
          return { ...s, phase: "awaitingTurnEnd", lastRoll: [d1, d2] };
        }
        const players = { ...state.players, [playerId]: { ...player, jailTurns } };
        return { ...state, players, phase: "awaitingTurnEnd", lastRoll: [d1, d2], log: [...log, `${playerId} stays in jail (attempt ${jailTurns}/3).`] };
      }

      const doublesStreak = doubles ? state.doublesStreak + 1 : 0;
      if (doublesStreak >= 3) {
        const players = { ...state.players, [playerId]: { ...player, position: JAIL_INDEX, inJail: true } };
        return {
          ...state,
          players,
          phase: "awaitingTurnEnd",
          lastRoll: [d1, d2],
          doublesStreak: 0,
          log: [...log, `${playerId} rolled doubles three times in a row and was sent to Jail!`],
        };
      }

      const oldPos = player.position;
      const newPos = (oldPos + d1 + d2) % BOARD.length;
      const passedGo = newPos < oldPos;
      const cash = player.cash + (passedGo ? GO_BONUS : 0);
      if (passedGo) log.push(`${playerId} passed GO and collected $200.`);
      const players = { ...state.players, [playerId]: { ...player, position: newPos, cash } };
      let s: MonopolyState = { ...state, players, lastRoll: [d1, d2], doublesStreak, log };
      s = resolveLanding(s, playerId, d1 + d2, s.log);
      if (s.players[playerId]!.bankrupt) return checkForSingleSurvivor({ ...s, phase: "awaitingTurnEnd" });
      if (s.phase === "awaitingPropertyDecision") return s;
      return { ...s, phase: doubles ? "awaitingRoll" : "awaitingTurnEnd" };
    }

    if (action.type === "buyProperty" || action.type === "declineProperty") {
      if (state.phase !== "awaitingPropertyDecision" || state.pendingPropertyIndex === null) {
        throw new GameActionError("No property decision pending.");
      }
      const idx = state.pendingPropertyIndex;
      const tile = BOARD[idx]!;
      let s: MonopolyState = state;
      if (action.type === "buyProperty") {
        const price = priceOf(tile);
        if (player.cash < price) throw new GameActionError("Not enough cash to buy this.");
        const players = { ...state.players, [playerId]: { ...player, cash: player.cash - price, properties: [...player.properties, idx] } };
        s = { ...state, players, log: [...log, `${playerId} bought ${tile.name} for $${price}.`] };
      } else {
        s = { ...state, log: [...log, `${playerId} declined to buy ${tile.name}.`] };
      }
      const backToRollAgain = state.doublesStreak > 0 && state.lastRoll && state.lastRoll[0] === state.lastRoll[1];
      return { ...s, pendingPropertyIndex: null, phase: backToRollAgain ? "awaitingRoll" : "awaitingTurnEnd" };
    }

    if (action.type === "buildHouse") {
      if (state.phase !== "awaitingTurnEnd" && state.phase !== "awaitingRoll") throw new GameActionError("You can't build right now.");
      const tile = BOARD[action.propertyIndex];
      if (!tile || tile.type !== "property") throw new GameActionError("That's not a property.");
      if (!player.properties.includes(action.propertyIndex)) throw new GameActionError("You don't own that property.");
      if (player.mortgaged.includes(action.propertyIndex)) throw new GameActionError("That property is mortgaged.");
      const ownsAll = colorGroupIndices(tile.color).every((i) => player.properties.includes(i) && !player.mortgaged.includes(i));
      if (!ownsAll) throw new GameActionError("You need to own the whole color group, unmortgaged, to build.");
      const houses = player.houses[action.propertyIndex] ?? 0;
      if (houses >= 5) throw new GameActionError("Already a hotel — nothing more to build.");
      if (player.cash < tile.houseCost) throw new GameActionError("Not enough cash to build.");
      const players = {
        ...state.players,
        [playerId]: { ...player, cash: player.cash - tile.houseCost, houses: { ...player.houses, [action.propertyIndex]: houses + 1 } },
      };
      return { ...state, players, log: [...log, `${playerId} built ${houses + 1 === 5 ? "a hotel" : "a house"} on ${tile.name}.`] };
    }

    if (action.type === "sellHouse") {
      const tile = BOARD[action.propertyIndex];
      if (!tile || tile.type !== "property") throw new GameActionError("That's not a property.");
      const houses = player.houses[action.propertyIndex] ?? 0;
      if (houses <= 0) throw new GameActionError("Nothing to sell there.");
      const refund = Math.floor(tile.houseCost / 2);
      const players = {
        ...state.players,
        [playerId]: { ...player, cash: player.cash + refund, houses: { ...player.houses, [action.propertyIndex]: houses - 1 } },
      };
      return { ...state, players, log: [...log, `${playerId} sold a house on ${tile.name} for $${refund}.`] };
    }

    if (action.type === "mortgageProperty") {
      if (!player.properties.includes(action.propertyIndex)) throw new GameActionError("You don't own that property.");
      if (player.mortgaged.includes(action.propertyIndex)) throw new GameActionError("Already mortgaged.");
      const tile = BOARD[action.propertyIndex]!;
      if (tile.type === "property" && (player.houses[action.propertyIndex] ?? 0) > 0) throw new GameActionError("Sell the houses first.");
      const value = Math.floor(priceOf(tile) / 2);
      const players = { ...state.players, [playerId]: { ...player, cash: player.cash + value, mortgaged: [...player.mortgaged, action.propertyIndex] } };
      return { ...state, players, log: [...log, `${playerId} mortgaged ${tile.name} for $${value}.`] };
    }

    if (action.type === "unmortgageProperty") {
      if (!player.mortgaged.includes(action.propertyIndex)) throw new GameActionError("That property isn't mortgaged.");
      const tile = BOARD[action.propertyIndex]!;
      const cost = Math.ceil((priceOf(tile) / 2) * 1.1);
      if (player.cash < cost) throw new GameActionError("Not enough cash to unmortgage.");
      const players = {
        ...state.players,
        [playerId]: { ...player, cash: player.cash - cost, mortgaged: player.mortgaged.filter((i) => i !== action.propertyIndex) },
      };
      return { ...state, players, log: [...log, `${playerId} paid off the mortgage on ${tile.name} for $${cost}.`] };
    }

    if (action.type === "endTurn") {
      if (state.phase !== "awaitingTurnEnd") throw new GameActionError("You can't end your turn right now.");
      const nextIndex = findNextTurnIndex(state, state.turnIndex);
      return { ...state, turnIndex: nextIndex, phase: "awaitingRoll", doublesStreak: 0, turnCount: state.turnCount + 1 };
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId) {
    const current = state.order[state.turnIndex]!;
    const properties: MonopolyPropertyView[] = BOARD.map((tile, index) => {
      if (!isOwnable(tile)) return { index, name: tile.name, ownerId: null, houses: 0, mortgaged: false };
      const owner = ownerOf(state, index);
      return {
        index,
        name: tile.name,
        color: tile.type === "property" ? tile.color : undefined,
        price: priceOf(tile),
        ownerId: owner,
        houses: owner ? state.players[owner]!.houses[index] ?? 0 : 0,
        mortgaged: owner ? state.players[owner]!.mortgaged.includes(index) : false,
      };
    });
    return {
      hostId: state.hostId,
      order: state.order,
      turnIndex: state.turnIndex,
      yourTurn: current === playerId && state.phase !== "finished",
      phase: state.phase,
      pendingPropertyIndex: state.pendingPropertyIndex,
      lastRoll: state.lastRoll,
      board: BOARD.map((t) => ({ type: t.type, name: t.name, color: t.type === "property" ? t.color : undefined, price: isOwnable(t) ? priceOf(t) : undefined })),
      properties,
      players: state.order.map((pid) => {
        const p = state.players[pid]!;
        return {
          id: p.id,
          position: p.position,
          cash: p.cash,
          propertyCount: p.properties.length,
          inJail: p.inJail,
          jailCards: p.jailCards,
          bankrupt: p.bankrupt,
          netWorth: netWorth(state, pid),
        };
      }),
      log: state.log.slice(-10),
    };
  },
  isGameOver(state) {
    return state.phase === "finished";
  },
  getWinnerIds(state) {
    if (state.phase !== "finished") return [];
    const alive = state.order.filter((pid) => !state.players[pid]!.bankrupt);
    const pool = alive.length > 0 ? alive : state.order;
    const values = pool.map((pid) => [pid, netWorth(state, pid)] as const);
    const max = Math.max(...values.map(([, v]) => v));
    return values.filter(([, v]) => v === max).map(([pid]) => pid);
  },
};
