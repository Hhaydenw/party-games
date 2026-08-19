import { GameActionError, GameDefinition, GameOptions, PlayerId } from "@/lib/types";

// A Pictionary/skribbl.io-style game: one player draws a secret word on a
// shared canvas, everyone else races to guess it in a chat-style feed.

// A big, varied pool (a few hundred entries, original picks not tied to any
// specific brand/franchise) so a longer game doesn't start repeating
// prompts — pickWordOptions() also excludes anything already drawn this
// game, but a bigger pool means that exclusion rarely has to fall back.
const WORD_BANK: string[] = [
  // Animals
  "guitar", "octopus", "unicorn", "kangaroo", "flamingo", "koala", "penguin", "peacock",
  "jellyfish", "dragon", "mermaid", "scarecrow", "dinosaur", "elephant", "giraffe", "gorilla",
  "hedgehog", "chameleon", "platypus", "narwhal", "walrus", "otter", "raccoon", "squirrel",
  "hippopotamus", "rhinoceros", "crocodile", "seahorse", "starfish", "stingray", "hammerhead shark",
  "toucan", "hummingbird", "owl", "bat", "spider", "scorpion", "praying mantis", "caterpillar",
  "butterfly", "ladybug", "firefly", "snail", "slug", "beehive", "anthill", "wolf pack",
  "polar bear", "grizzly bear", "panda", "sloth", "armadillo", "porcupine", "skunk", "beaver",
  "moose", "reindeer", "camel", "llama", "alpaca", "yak", "buffalo", "gazelle", "cheetah",
  "leopard", "jaguar", "lynx", "meerkat", "mongoose", "wombat", "tasmanian devil", "kiwi bird",
  "ostrich", "emu", "vulture", "falcon", "eagle", "swan", "pelican", "seagull", "puffin",
  // Food & drink
  "pizza", "sandwich", "cupcake", "avocado", "waffle", "pretzel", "hot dog", "taco",
  "burrito", "sushi roll", "ramen", "pancake stack", "ice cream cone", "popsicle", "donut",
  "birthday cake", "gingerbread man", "s'mores", "corn on the cob", "watermelon slice",
  "pineapple", "coconut", "banana split", "milkshake", "smoothie", "bubble tea", "espresso",
  "grilled cheese", "nachos", "popcorn", "cotton candy", "lollipop", "gumball machine",
  "fortune cookie", "dumpling", "spaghetti", "meatball", "cheese wheel", "honeycomb",
  "picnic basket", "lemonade stand", "food truck", "candy cane", "marshmallow", "pie slice",
  // Places
  "castle", "lighthouse", "volcano", "waterfall", "campground", "haunted house", "windmill",
  "igloo", "chandelier", "submarine", "roller coaster", "amusement park", "ferris wheel",
  "desert island", "coral reef", "rainforest", "glacier", "canyon", "cave", "quarry",
  "treehouse", "tent", "log cabin", "greenhouse", "barn", "silo", "windfarm", "skyscraper",
  "bridge", "tunnel", "subway station", "airport", "harbor", "shipwreck", "pirate cove",
  "space station", "moon base", "observatory", "planetarium", "library", "museum", "aquarium",
  "zoo", "botanical garden", "maze", "labyrinth", "castle moat", "drawbridge", "watchtower",
  "windmill farm", "vineyard", "orchard", "rice paddy", "sand dune", "iceberg", "volcano island",
  // Objects
  "umbrella", "backpack", "compass", "telescope", "hammock", "typewriter", "bagpipes",
  "saxophone", "trampoline", "skateboard", "hot air balloon", "treasure chest", "snorkel",
  "helicopter", "spaceship", "robot", "wizard", "lightning bolt", "rainbow", "campfire",
  "snowman", "cactus", "tornado", "bowling ball", "kite", "yo-yo", "slingshot", "boomerang",
  "magnifying glass", "flashlight", "lantern", "toolbox", "wheelbarrow", "ladder", "anchor",
  "steering wheel", "parachute", "hot water bottle", "sewing machine", "spinning wheel",
  "grandfather clock", "hourglass", "chess set", "jigsaw puzzle", "rubber duck", "piggy bank",
  "treasure map", "pirate flag", "crown", "throne", "scepter", "shield", "sword", "bow and arrow",
  "catapult", "trebuchet", "drawbridge chain", "birdcage", "fishbowl", "terrarium", "snow globe",
  "music box", "carousel horse", "puppet", "marionette", "kaleidoscope", "periscope",
  "binoculars", "stethoscope", "thermometer", "microscope", "test tube", "beaker",
  "chemistry set", "paint palette", "easel", "pottery wheel", "loom", "quill pen",
  "inkwell", "wax seal", "scroll", "treasure key", "padlock", "skeleton key", "trapdoor",
  // Vehicles
  "hot air balloon ride", "unicycle", "scooter", "monster truck", "race car", "tractor",
  "bulldozer", "crane truck", "cement mixer", "fire truck", "ambulance", "school bus",
  "golf cart", "rickshaw", "gondola", "cable car", "hovercraft", "jet ski", "canoe",
  "kayak", "sailboat", "cruise ship", "cargo ship", "biplane", "hang glider", "hot rod",
  "go kart", "tandem bicycle", "penny farthing bike", "wagon train", "steam engine train",
  "rocket ship", "flying saucer", "hover board", "pogo stick", "roller skates",
  // Sports & hobbies
  "trampoline dunk", "surfboard", "skateboard ramp", "bowling pin", "tennis racket",
  "golf swing", "hockey stick", "boxing glove", "dartboard", "archery target",
  "gymnastics ribbon", "trapeze", "unicycle juggling", "juggling balls", "tightrope walker",
  "fishing rod", "campfire marshmallow roast", "tent pitching", "rock climbing wall",
  "zipline", "bungee jump", "parasailing", "snowboarding", "ice skating", "sled",
  "snowball fight", "sandcastle", "beach volleyball", "frisbee", "hula hoop",
  "pogo stick jump", "chess match", "board game night", "video game controller",
  "karate chop", "yoga pose", "tug of war", "three legged race", "pinata",
  // Nature & weather
  "shooting star", "constellation", "solar eclipse", "meteor shower", "aurora borealis",
  "sand dune ripple", "lightning storm", "hurricane", "tsunami wave", "avalanche",
  "earthquake crack", "geyser", "hot spring", "quicksand", "mushroom patch", "beehive swarm",
  "spider web", "dew drop", "frost pattern", "icicle", "rain puddle", "double rainbow",
  "sunflower field", "cherry blossom tree", "bamboo forest", "redwood tree", "willow tree",
  "venus flytrap", "carnivorous plant", "coral reef fish", "tide pool", "sand castle moat",
  // Fantasy & sci-fi
  "wizard's hat", "magic wand", "crystal ball", "flying broomstick", "dragon egg",
  "phoenix rising", "griffin", "centaur", "mermaid tail", "fairy garden", "goblin",
  "troll under a bridge", "genie in a lamp", "magic carpet", "enchanted forest",
  "time machine", "alien spaceship", "robot uprising", "cyborg", "laser gun",
  "force field", "teleporter", "black hole", "wormhole", "asteroid belt", "space rover",
  "jetpack", "hoverboard chase", "invisible cloak", "shape shifter", "werewolf",
  "vampire cape", "zombie shuffle", "ghost sheet", "haunted mirror", "witch's cauldron",
  // Everyday scenes
  "morning alarm clock", "traffic jam", "grocery shopping cart", "laundry basket",
  "vacuum cleaner", "lawn mower", "garden hose", "clothesline", "mailbox", "doorbell",
  "umbrella stand", "coat rack", "shoe rack", "bookshelf", "bunk bed", "rocking chair",
  "porch swing", "welcome mat", "picket fence", "birdhouse", "bird feeder", "scarecrow field",
  "farmers market stall", "lemonade stand sign", "garage sale", "moving truck",
  "office cubicle", "conference call", "traffic light", "crosswalk", "roundabout",
  "construction site", "wrecking ball", "scaffolding", "elevator", "escalator",
  "revolving door", "vending machine", "photo booth", "carnival game booth",
];

const ROUND_MS = 80_000;

export type DrawingPhase = "choosing" | "drawing" | "roundEnd" | "finished";

export interface StrokePoint {
  x: number; // 0..1, relative to canvas size
  y: number;
}

export interface Stroke {
  id: string;
  color: string;
  width: number;
  points: StrokePoint[];
}

interface GuessLogEntry {
  id: string;
  playerId: PlayerId;
  text: string;
  correct: boolean;
  at: number;
}

export interface DrawingState {
  hostId: PlayerId;
  playerIds: PlayerId[];
  order: PlayerId[]; // drawer rotation — one full lap through this is one round
  // Raw drawer-turn counter — increments once per individual drawing turn,
  // not once per round. A "round" is every player drawing once (one lap
  // through `order`), so roundIndex/totalRounds (below, and in the view)
  // are always derived from this rather than tracked directly.
  turnIndex: number;
  totalRounds: number; // laps through `order` — the user-facing "Rounds" option
  drawerId: PlayerId;
  phase: DrawingPhase;
  usedWords: string[];
  wordOptions: string[];
  word: string | null;
  strokes: Stroke[];
  guesses: GuessLogEntry[];
  correctGuessers: PlayerId[];
  roundEndsAt: number | null;
  scores: Record<PlayerId, number>;
  lastRoundReveal: { word: string; correctGuessers: PlayerId[] } | null;
}

export interface DrawingView {
  hostId: PlayerId;
  isDrawer: boolean;
  drawerId: PlayerId;
  phase: DrawingPhase;
  roundIndex: number; // 0-based — which lap through all players this is
  totalRounds: number;
  turnInRound: number; // 1-based — this drawer's position within the current round
  playersPerRound: number;
  wordOptions: string[] | null;
  word: string | null;
  wordMask: string | null; // e.g. "_____ __" — underscores for letters, spaces preserved
  strokes: Stroke[];
  guesses: { id: string; playerId: PlayerId; text: string | null; correct: boolean; at: number }[];
  correctGuessers: PlayerId[];
  youGuessedCorrectly: boolean;
  roundEndsAt: number | null;
  scores: { playerId: PlayerId; score: number }[];
  lastRoundReveal: { word: string; correctGuessers: PlayerId[] } | null;
}

export type DrawingAction =
  | { type: "chooseWord"; word: string }
  | { type: "strokeStart"; strokeId: string; color: string; width: number; point: StrokePoint }
  | { type: "strokePoint"; strokeId: string; point: StrokePoint }
  | { type: "strokeEnd"; strokeId: string }
  | { type: "clear" }
  | { type: "guess"; text: string }
  | { type: "timeUp" }
  | { type: "advance" };

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

function maskWord(word: string): string {
  return word
    .split("")
    .map((ch) => (ch === " " ? " " : "_"))
    .join("");
}

function pickWordOptions(used: string[]): string[] {
  const available = WORD_BANK.filter((w) => !used.includes(w));
  const pool = available.length >= 3 ? available : WORD_BANK;
  return shuffle(pool).slice(0, 3);
}

let guessSeq = 0;
function nextGuessId(): string {
  guessSeq += 1;
  return `g${guessSeq}`;
}

function endRound(state: DrawingState): DrawingState {
  const bonus = state.correctGuessers.length;
  const scores = { ...state.scores };
  if (bonus > 0) scores[state.drawerId] = (scores[state.drawerId] ?? 0) + bonus;
  return {
    ...state,
    phase: "roundEnd",
    scores,
    lastRoundReveal: { word: state.word ?? "", correctGuessers: state.correctGuessers },
  };
}

export const drawing: GameDefinition<DrawingState, DrawingView, DrawingAction> = {
  meta: {
    id: "drawing",
    name: "Doodle Guess",
    tagline: "One player draws, everyone else races to guess. Pictionary-style.",
    category: "party",
    minPlayers: 3,
    maxPlayers: 10,
    // "Rounds" now means full laps through every player (everyone draws
    // once = one round), not individual turns, so the range is capped a
    // lot lower than the old per-turn count — 5 rounds with 8 players is
    // already 40 individual turns.
    options: [{ key: "rounds", label: "Rounds", type: "number", min: 1, max: 6, default: 3 }],
  },
  createInitialState(players, options: GameOptions) {
    const host = players.find((p) => p.isHost) ?? players[0]!;
    const order = shuffle(players.map((p) => p.id));
    const scores: Record<PlayerId, number> = {};
    for (const p of players) scores[p.id] = 0;
    return {
      hostId: host.id,
      playerIds: players.map((p) => p.id),
      order,
      turnIndex: 0,
      totalRounds: Math.min(Math.max(Number(options.rounds) || 3, 1), 6),
      drawerId: order[0]!,
      phase: "choosing",
      usedWords: [],
      wordOptions: pickWordOptions([]),
      word: null,
      strokes: [],
      guesses: [],
      correctGuessers: [],
      roundEndsAt: null,
      scores,
      lastRoundReveal: null,
    };
  },
  applyAction(state, playerId, action) {
    if (state.phase === "finished") throw new GameActionError("Game is already over.");

    if (action.type === "chooseWord") {
      if (state.phase !== "choosing") throw new GameActionError("Not choosing a word right now.");
      if (playerId !== state.drawerId) throw new GameActionError("Only the drawer picks the word.");
      if (!state.wordOptions.includes(action.word)) throw new GameActionError("Invalid word choice.");
      return {
        ...state,
        phase: "drawing",
        word: action.word,
        usedWords: [...state.usedWords, action.word],
        strokes: [],
        guesses: [],
        correctGuessers: [],
        roundEndsAt: Date.now() + ROUND_MS,
      };
    }

    if (action.type === "strokeStart") {
      if (state.phase !== "drawing") throw new GameActionError("Not drawing right now.");
      if (playerId !== state.drawerId) throw new GameActionError("Only the drawer can draw.");
      const stroke: Stroke = { id: action.strokeId, color: action.color, width: action.width, points: [action.point] };
      return { ...state, strokes: [...state.strokes, stroke] };
    }

    if (action.type === "strokePoint") {
      if (state.phase !== "drawing") throw new GameActionError("Not drawing right now.");
      if (playerId !== state.drawerId) throw new GameActionError("Only the drawer can draw.");
      const idx = state.strokes.findIndex((s) => s.id === action.strokeId);
      if (idx === -1) return state; // stroke start was dropped/raced; ignore quietly
      const strokes = state.strokes.slice();
      strokes[idx] = { ...strokes[idx]!, points: [...strokes[idx]!.points, action.point] };
      return { ...state, strokes };
    }

    if (action.type === "strokeEnd") {
      if (playerId !== state.drawerId) throw new GameActionError("Only the drawer can draw.");
      return state; // bookkeeping no-op; kept for symmetry / future undo support
    }

    if (action.type === "clear") {
      if (state.phase !== "drawing") throw new GameActionError("Not drawing right now.");
      if (playerId !== state.drawerId) throw new GameActionError("Only the drawer can clear the canvas.");
      return { ...state, strokes: [] };
    }

    if (action.type === "guess") {
      if (state.phase !== "drawing") throw new GameActionError("Not accepting guesses right now.");
      if (playerId === state.drawerId) throw new GameActionError("The drawer can't guess.");
      if (state.correctGuessers.includes(playerId)) throw new GameActionError("You already guessed it.");
      const text = action.text.trim().slice(0, 60);
      if (!text) throw new GameActionError("Guess can't be empty.");
      const isCorrect = state.word !== null && text.toLowerCase() === state.word.toLowerCase();
      const entry: GuessLogEntry = { id: nextGuessId(), playerId, text, correct: isCorrect, at: Date.now() };
      let next: DrawingState = { ...state, guesses: [...state.guesses.slice(-49), entry] };

      if (isCorrect) {
        const position = state.correctGuessers.length;
        const points = position === 0 ? 3 : position === 1 ? 2 : 1;
        next = {
          ...next,
          correctGuessers: [...state.correctGuessers, playerId],
          scores: { ...next.scores, [playerId]: (next.scores[playerId] ?? 0) + points },
        };
        const everyoneIn = state.playerIds.filter((id) => id !== state.drawerId).every((id) => next.correctGuessers.includes(id));
        if (everyoneIn) next = endRound(next);
      }
      return next;
    }

    if (action.type === "timeUp") {
      if (state.phase !== "drawing") throw new GameActionError("Round already ended.");
      return endRound(state);
    }

    if (action.type === "advance") {
      if (playerId !== state.hostId && playerId !== state.drawerId) throw new GameActionError("Only the host or drawer can advance.");
      if (state.phase !== "roundEnd") throw new GameActionError("Nothing to advance.");
      const nextTurnIndex = state.turnIndex + 1;
      const totalTurns = state.totalRounds * state.order.length;
      if (nextTurnIndex >= totalTurns) {
        return { ...state, phase: "finished" };
      }
      return {
        ...state,
        turnIndex: nextTurnIndex,
        drawerId: state.order[nextTurnIndex % state.order.length]!,
        phase: "choosing",
        wordOptions: pickWordOptions(state.usedWords),
        word: null,
        strokes: [],
        guesses: [],
        correctGuessers: [],
        roundEndsAt: null,
        lastRoundReveal: null,
      };
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId) {
    const isDrawer = playerId === state.drawerId;
    const viewerAlreadyCorrect = state.correctGuessers.includes(playerId);
    return {
      hostId: state.hostId,
      isDrawer,
      drawerId: state.drawerId,
      phase: state.phase,
      roundIndex: Math.floor(state.turnIndex / state.order.length),
      totalRounds: state.totalRounds,
      turnInRound: (state.turnIndex % state.order.length) + 1,
      playersPerRound: state.order.length,
      wordOptions: isDrawer && state.phase === "choosing" ? state.wordOptions : null,
      word: isDrawer ? state.word : state.phase === "roundEnd" || state.phase === "finished" ? state.lastRoundReveal?.word ?? null : null,
      wordMask: !isDrawer && state.phase === "drawing" && state.word ? maskWord(state.word) : null,
      strokes: state.strokes,
      guesses: state.guesses.map((g) => ({
        id: g.id,
        playerId: g.playerId,
        correct: g.correct,
        at: g.at,
        text: !g.correct || isDrawer || g.playerId === playerId || viewerAlreadyCorrect ? g.text : null,
      })),
      correctGuessers: state.correctGuessers,
      youGuessedCorrectly: viewerAlreadyCorrect,
      roundEndsAt: state.roundEndsAt,
      scores: state.playerIds.map((pid) => ({ playerId: pid, score: state.scores[pid] ?? 0 })),
      lastRoundReveal: state.phase === "roundEnd" || state.phase === "finished" ? state.lastRoundReveal : null,
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
