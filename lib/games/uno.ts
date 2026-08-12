import { GameActionError, GameDefinition, PlayerId } from "@/lib/types";

export type UnoColor = "red" | "yellow" | "green" | "blue";
export type UnoValue = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "skip" | "reverse" | "draw2" | "wild" | "wild4";

export interface UnoCard {
  id: string;
  color: UnoColor | "wild";
  value: UnoValue;
}

// When the "stacking" house rule is on, a draw2/wild4 doesn't resolve
// immediately — it becomes a pending draw that the next player can either
// escalate by stacking a matching card, or must absorb by drawing the
// accumulated total (and losing their turn).
export interface PendingDraw {
  kind: "draw2" | "wild4";
  count: number;
}

export interface UnoState {
  drawPile: UnoCard[];
  discardPile: UnoCard[];
  hands: Record<PlayerId, UnoCard[]>;
  order: PlayerId[];
  turnIndex: number;
  direction: 1 | -1;
  currentColor: UnoColor;
  stackingEnabled: boolean;
  pendingDraw: PendingDraw | null;
  winnerId: PlayerId | null;
  log: string[];
}

export interface UnoView {
  yourHand: UnoCard[];
  handCounts: Record<PlayerId, number>;
  discardTop: UnoCard | null;
  drawPileCount: number;
  order: PlayerId[];
  turnIndex: number;
  currentColor: UnoColor;
  stackingEnabled: boolean;
  pendingDraw: PendingDraw | null;
  yourTurn: boolean;
  winnerId: PlayerId | null;
  log: string[];
}

export type UnoAction = { type: "play"; cardId: string; chosenColor?: UnoColor } | { type: "draw" };

const COLORS: UnoColor[] = ["red", "yellow", "green", "blue"];

let cardSeq = 0;
function card(color: UnoCard["color"], value: UnoValue): UnoCard {
  cardSeq += 1;
  return { id: `c${cardSeq}-${color}-${value}`, color, value };
}

function buildDeck(): UnoCard[] {
  const deck: UnoCard[] = [];
  for (const color of COLORS) {
    deck.push(card(color, "0"));
    for (const v of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "draw2"] as UnoValue[]) {
      deck.push(card(color, v));
      deck.push(card(color, v));
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push(card("wild", "wild"));
    deck.push(card("wild", "wild4"));
  }
  return deck;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

// Draws `n` cards, reshuffling the discard pile (minus its top card) back
// into the draw pile if it runs out. Returns new pile arrays + drawn cards.
function drawCards(drawPile: UnoCard[], discardPile: UnoCard[], n: number) {
  let draw = drawPile.slice();
  let discard = discardPile.slice();
  const drawn: UnoCard[] = [];
  for (let i = 0; i < n; i++) {
    if (draw.length === 0) {
      if (discard.length <= 1) break; // nothing left to reshuffle
      const top = discard[discard.length - 1]!;
      draw = shuffle(discard.slice(0, -1));
      discard = [top];
    }
    const next = draw.pop();
    if (next) drawn.push(next);
  }
  return { draw, discard, drawn };
}

// Exported so the client can compute "do I have any legal play?" itself and
// auto-draw on the player's behalf instead of leaving them stuck.
export function isPlayable(card: UnoCard, top: UnoCard, currentColor: UnoColor, pendingDraw: PendingDraw | null): boolean {
  if (pendingDraw) {
    // Under a pending stack, only a matching draw card keeps it going —
    // even a wild can't get you out of it.
    return card.value === pendingDraw.kind;
  }
  if (card.color === "wild") return true;
  return card.color === currentColor || card.value === top.value;
}

export const uno: GameDefinition<UnoState, UnoView, UnoAction> = {
  meta: {
    id: "uno",
    name: "Switch",
    tagline: "Match colors and numbers, dump your hand first. (Uno-style)",
    category: "card",
    minPlayers: 2,
    maxPlayers: 8,
    options: [
      {
        key: "stacking",
        label: "House rule: stack +2/+4",
        type: "select",
        choices: [
          { value: "off", label: "Off (classic)" },
          { value: "on", label: "On — stack matching draw cards" },
        ],
        default: "off",
      },
    ],
  },
  createInitialState(players, options) {
    let deck = shuffle(buildDeck());
    const hands: Record<PlayerId, UnoCard[]> = {};
    for (const p of players) {
      hands[p.id] = deck.slice(0, 7);
      deck = deck.slice(7);
    }
    // First discard card must be a plain color/number card.
    let discardTop = deck.pop()!;
    while (discardTop.color === "wild") {
      deck.unshift(discardTop);
      deck = shuffle(deck);
      discardTop = deck.pop()!;
    }
    return {
      drawPile: deck,
      discardPile: [discardTop],
      hands,
      order: players.map((p) => p.id),
      turnIndex: 0,
      direction: 1,
      currentColor: discardTop.color as UnoColor,
      stackingEnabled: options?.stacking === "on",
      pendingDraw: null,
      winnerId: null,
      log: [`Game started. Top card: ${discardTop.color} ${discardTop.value}.`],
    };
  },
  applyAction(state, playerId, action) {
    if (state.winnerId) throw new GameActionError("Game is already over.");
    const order = state.order;
    const current = order[state.turnIndex];

    if (current !== playerId) throw new GameActionError("It's not your turn.");

    const hand = state.hands[playerId] ?? [];
    const top = state.discardPile[state.discardPile.length - 1]!;

    if (action.type === "draw") {
      // A pending stack (house rule) forces drawing the accumulated total
      // and skips this player's turn instead of a normal single draw.
      const drawCount = state.pendingDraw?.count ?? 1;
      const { draw, discard, drawn } = drawCards(state.drawPile, state.discardPile, drawCount);
      const newHand = [...hand, ...drawn];
      const nextIndex = (state.turnIndex + state.direction + order.length) % order.length;
      return {
        ...state,
        drawPile: draw,
        discardPile: discard,
        hands: { ...state.hands, [playerId]: newHand },
        turnIndex: nextIndex,
        pendingDraw: null,
        log: [...state.log, state.pendingDraw ? `${playerId} draws ${drawCount} and is skipped.` : `${playerId} drew a card.`],
      };
    }

    if (action.type === "play") {
      const idx = hand.findIndex((c) => c.id === action.cardId);
      if (idx === -1) throw new GameActionError("You don't have that card.");
      const played = hand[idx]!;
      if (!isPlayable(played, top, state.currentColor, state.pendingDraw)) {
        throw new GameActionError(
          state.pendingDraw ? `You must stack another ${state.pendingDraw.kind === "draw2" ? "+2" : "+4"} or draw ${state.pendingDraw.count}.` : "That card doesn't match."
        );
      }
      if (played.color === "wild" && !action.chosenColor) throw new GameActionError("Choose a color for that wild card.");

      const newHand = hand.slice(0, idx).concat(hand.slice(idx + 1));
      const newHands = { ...state.hands, [playerId]: newHand };
      const newDiscard = [...state.discardPile, played];
      const resolvedColor: UnoColor = played.color === "wild" ? action.chosenColor! : (played.color as UnoColor);

      if (newHand.length === 0) {
        return {
          ...state,
          hands: newHands,
          discardPile: newDiscard,
          currentColor: resolvedColor,
          winnerId: playerId,
          log: [...state.log, `${playerId} played their last card and won!`],
        };
      }

      let direction = state.direction;
      let turnIndex = state.turnIndex;
      let drawPile = state.drawPile;
      let discardPile = newDiscard;
      let log = [...state.log, `${playerId} played ${played.color} ${played.value}.`];
      let hands = newHands;
      let pendingDraw: PendingDraw | null = null;

      const advance = (steps: number) => (turnIndex + direction * steps + order.length * 4) % order.length;

      switch (played.value) {
        case "skip":
          turnIndex = advance(2);
          break;
        case "reverse":
          if (order.length === 2) {
            turnIndex = advance(2);
          } else {
            direction = (direction * -1) as 1 | -1;
            turnIndex = (turnIndex + direction + order.length) % order.length;
          }
          break;
        case "draw2": {
          if (state.stackingEnabled) {
            pendingDraw = { kind: "draw2", count: (state.pendingDraw?.count ?? 0) + 2 };
            log = [...log, `+2! Stacked total: ${pendingDraw.count}.`];
            turnIndex = advance(1);
          } else {
            const victim = order[advance(1)]!;
            const res = drawCards(drawPile, discardPile, 2);
            drawPile = res.draw;
            discardPile = res.discard;
            hands = { ...hands, [victim]: [...(hands[victim] ?? []), ...res.drawn] };
            log = [...log, `${victim} draws 2 and is skipped.`];
            turnIndex = advance(2);
          }
          break;
        }
        case "wild4": {
          if (state.stackingEnabled) {
            pendingDraw = { kind: "wild4", count: (state.pendingDraw?.count ?? 0) + 4 };
            log = [...log, `+4! Stacked total: ${pendingDraw.count}.`];
            turnIndex = advance(1);
          } else {
            const victim = order[advance(1)]!;
            const res = drawCards(drawPile, discardPile, 4);
            drawPile = res.draw;
            discardPile = res.discard;
            hands = { ...hands, [victim]: [...(hands[victim] ?? []), ...res.drawn] };
            log = [...log, `${victim} draws 4 and is skipped.`];
            turnIndex = advance(2);
          }
          break;
        }
        case "wild":
          turnIndex = advance(1);
          break;
        default:
          turnIndex = advance(1);
      }

      return {
        ...state,
        hands,
        drawPile,
        discardPile,
        pendingDraw,
        direction,
        turnIndex,
        currentColor: resolvedColor,
        log,
      };
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId) {
    const handCounts: Record<PlayerId, number> = {};
    for (const pid of state.order) handCounts[pid] = state.hands[pid]?.length ?? 0;
    return {
      yourHand: state.hands[playerId] ?? [],
      handCounts,
      discardTop: state.discardPile[state.discardPile.length - 1] ?? null,
      drawPileCount: state.drawPile.length,
      order: state.order,
      turnIndex: state.turnIndex,
      currentColor: state.currentColor,
      stackingEnabled: state.stackingEnabled,
      pendingDraw: state.pendingDraw,
      yourTurn: state.order[state.turnIndex] === playerId && !state.winnerId,
      winnerId: state.winnerId,
      log: state.log.slice(-8),
    };
  },
  isGameOver(state) {
    return !!state.winnerId;
  },
  getWinnerIds(state) {
    return state.winnerId ? [state.winnerId] : [];
  },
  getRanking(state) {
    // Winner first; everyone else ranked by cards remaining (fewer = better).
    const rest = state.order.filter((id) => id !== state.winnerId).sort((a, b) => (state.hands[a]?.length ?? 99) - (state.hands[b]?.length ?? 99));
    return state.winnerId ? [state.winnerId, ...rest] : rest;
  },
};
