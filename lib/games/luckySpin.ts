import { GameActionError, GameDefinition, GameOptions, PlayerId } from "@/lib/types";
import { substituteNames } from "@/lib/games/logNames";

// A Wheel-of-Fortune-style letter-guessing game (original name/content, not
// affiliated with or copied from any TV show): spin for a dollar value,
// guess a consonant — right guesses reveal it and let you spin again; a
// miss passes the turn. Buy a vowel for $250 any time it's your turn, or
// try to solve the puzzle outright. Whoever solves banks that round's
// earnings.

const VOWELS = new Set(["A", "E", "I", "O", "U"]);
const VOWEL_COST = 250;
const DEFAULT_ROUNDS = 5;

// How long the wheel visually spins for, from every client's perspective —
// exported so the view component drives its CSS animation off the exact
// same number rather than guessing a matching duration independently. This
// is set server-side as a real deadline (`spinEndsAt`, an absolute
// timestamp like every other timer in this app) rather than left as a
// purely client-local `setTimeout`, specifically so every player's client
// — not just whoever clicked Spin — can derive "is a spin currently
// animating" from the exact same source of truth.
export const SPIN_DURATION_MS = 2600;

// Dollar segments plus penalty segments — 24 wedges, matching the real
// show's wheel count (an original wedge/value layout, not a copy of any
// specific broadcast wheel), with the same flavor: mostly cash in a
// realistic-looking spread, a couple of Bankrupt traps, one Lose a Turn,
// and one stand-out high-value "jackpot" wedge.
export type WheelSegment = number | "BANKRUPT" | "LOSE_TURN";
// Exported (as a real value, not just a type) so the client can render an
// actual wheel with these exact wedges in this exact order, and rotate it
// to the specific wedge the server picked rather than just displaying the
// resulting dollar amount in a spinning circle.
export const WHEEL: WheelSegment[] = [
  600, 700, 900, 500, 800, 2500, "BANKRUPT", 600,
  700, 650, 900, "LOSE_TURN", 500, 800, 600, 900,
  750, 550, "BANKRUPT", 700, 600, 500, 850, 650,
];

interface PuzzleDef {
  category: string;
  phrase: string;
}

// Original puzzles, written fresh for this app (not transcribed from any
// broadcast) — same approach as Family Feud's question bank and Wildest
// Answer's prompts.
const PUZZLE_BANK: PuzzleDef[] = [
  { category: "Phrase", phrase: "BETTER LATE THAN NEVER" },
  { category: "Phrase", phrase: "ACTIONS SPEAK LOUDER THAN WORDS" },
  { category: "Phrase", phrase: "PRACTICE MAKES PERFECT" },
  { category: "Phrase", phrase: "TIME FLIES WHEN YOU ARE HAVING FUN" },
  { category: "Phrase", phrase: "DONT JUDGE A BOOK BY ITS COVER" },
  { category: "Phrase", phrase: "EVERY CLOUD HAS A SILVER LINING" },
  { category: "Phrase", phrase: "THE EARLY BIRD CATCHES THE WORM" },
  { category: "Phrase", phrase: "ONE STEP AT A TIME" },
  { category: "Phrase", phrase: "BACK TO THE DRAWING BOARD" },
  { category: "Phrase", phrase: "OUT OF SIGHT OUT OF MIND" },
  { category: "Phrase", phrase: "DONT COUNT YOUR CHICKENS BEFORE THEY HATCH" },
  { category: "Phrase", phrase: "THE GRASS IS ALWAYS GREENER" },
  { category: "Phrase", phrase: "WHEN IT RAINS IT POURS" },
  { category: "Phrase", phrase: "SLOW AND STEADY WINS THE RACE" },
  { category: "Phrase", phrase: "DONT CRY OVER SPILLED MILK" },
  { category: "Phrase", phrase: "A PENNY SAVED IS A PENNY EARNED" },
  { category: "Phrase", phrase: "THE PROOF IS IN THE PUDDING" },
  { category: "Phrase", phrase: "ONCE IN A BLUE MOON" },
  { category: "Phrase", phrase: "BITE OFF MORE THAN YOU CAN CHEW" },
  { category: "Phrase", phrase: "BARKING UP THE WRONG TREE" },
  { category: "Phrase", phrase: "LET THE CAT OUT OF THE BAG" },
  { category: "Phrase", phrase: "HIT THE NAIL ON THE HEAD" },
  { category: "Phrase", phrase: "TWO PEAS IN A POD" },
  { category: "Phrase", phrase: "THE BALL IS IN YOUR COURT" },
  { category: "Phrase", phrase: "CUT TO THE CHASE" },
  { category: "Phrase", phrase: "IT TAKES TWO TO TANGO" },
  { category: "Phrase", phrase: "BEND OVER BACKWARDS" },
  { category: "Phrase", phrase: "GET YOUR DUCKS IN A ROW" },
  { category: "Movie Title", phrase: "THE MIDNIGHT TRAIN HOME" },
  { category: "Movie Title", phrase: "SUMMER OF BROKEN DREAMS" },
  { category: "Movie Title", phrase: "THE LAST LIGHTHOUSE KEEPER" },
  { category: "Movie Title", phrase: "RUNNING WITH WOLVES" },
  { category: "Movie Title", phrase: "A STRANGER IN THE ATTIC" },
  { category: "Movie Title", phrase: "THE ACCIDENTAL DETECTIVE" },
  { category: "Movie Title", phrase: "THE SECRET LIFE OF NEIGHBORS" },
  { category: "Movie Title", phrase: "A WEEKEND TO REMEMBER" },
  { category: "Movie Title", phrase: "THE LAST TICKET HOME" },
  { category: "Movie Title", phrase: "SHADOWS OVER THE HARBOR" },
  { category: "Movie Title", phrase: "THE UNEXPECTED HOUSEGUEST" },
  { category: "Movie Title", phrase: "A THOUSAND MILES FROM HOME" },
  { category: "Movie Title", phrase: "THE QUIET STORM" },
  { category: "Movie Title", phrase: "BENEATH THE OLD OAK TREE" },
  { category: "Movie Title", phrase: "THE LAST DANCE OF SUMMER" },
  { category: "Movie Title", phrase: "WHISPERS IN THE HALLWAY" },
  { category: "Place", phrase: "A COZY CABIN IN THE MOUNTAINS" },
  { category: "Place", phrase: "THE CORNER COFFEE SHOP" },
  { category: "Place", phrase: "A CROWDED FARMERS MARKET" },
  { category: "Place", phrase: "THE OLD LIGHTHOUSE ON THE CLIFF" },
  { category: "Place", phrase: "A QUIET LIBRARY READING ROOM" },
  { category: "Place", phrase: "THE AMUSEMENT PARK FERRIS WHEEL" },
  { category: "Place", phrase: "A SUNNY BACKYARD GARDEN" },
  { category: "Place", phrase: "THE LOCAL BOWLING ALLEY" },
  { category: "Place", phrase: "A CROWDED SUBWAY PLATFORM" },
  { category: "Place", phrase: "THE NEIGHBORHOOD ICE CREAM PARLOR" },
  { category: "Place", phrase: "A DUSTY ANTIQUE BOOKSTORE" },
  { category: "Place", phrase: "THE ROOFTOP OF A TALL BUILDING" },
  { category: "Place", phrase: "A SANDY STRETCH OF BEACH" },
  { category: "Place", phrase: "THE WAITING ROOM AT THE DENTIST" },
  { category: "Place", phrase: "A CROWDED MOVIE THEATER LOBBY" },
  { category: "Person", phrase: "A FRIENDLY NEIGHBORHOOD MAIL CARRIER" },
  { category: "Person", phrase: "MY GRANDMOTHERS BEST FRIEND" },
  { category: "Person", phrase: "THE WORLDS GREATEST MAGICIAN" },
  { category: "Person", phrase: "A STUBBORN LITTLE BROTHER" },
  { category: "Person", phrase: "THE NEW KID ON THE BLOCK" },
  { category: "Person", phrase: "A NOSY NEXT DOOR NEIGHBOR" },
  { category: "Person", phrase: "THE FUNNIEST PERSON I KNOW" },
  { category: "Person", phrase: "A LOYAL CHILDHOOD FRIEND" },
  { category: "Person", phrase: "THE FAMILYS BLACK SHEEP" },
  { category: "Person", phrase: "A CHATTY HAIRDRESSER" },
  { category: "Person", phrase: "THE SCHOOL BUS DRIVER" },
  { category: "Person", phrase: "A COMPETITIVE BOARD GAME PLAYER" },
  { category: "Thing", phrase: "A RUSTY OLD BICYCLE" },
  { category: "Thing", phrase: "A HOMEMADE APPLE PIE" },
  { category: "Thing", phrase: "A COMFORTABLE PAIR OF SLIPPERS" },
  { category: "Thing", phrase: "A BRAND NEW SET OF HEADPHONES" },
  { category: "Thing", phrase: "A HANDWRITTEN LOVE LETTER" },
  { category: "Thing", phrase: "A SLIGHTLY BROKEN UMBRELLA" },
  { category: "Thing", phrase: "A DUSTY BOX OF OLD PHOTOS" },
  { category: "Thing", phrase: "A FAVORITE COZY BLANKET" },
  { category: "Thing", phrase: "A NEVER ENDING TO DO LIST" },
  { category: "Thing", phrase: "A CRACKED PHONE SCREEN" },
  { category: "Thing", phrase: "A MISMATCHED PAIR OF SOCKS" },
  { category: "Thing", phrase: "A WELL LOVED STUFFED ANIMAL" },
  { category: "Thing", phrase: "A SQUEAKY OFFICE CHAIR" },
  { category: "Thing", phrase: "A HALF FINISHED CROSSWORD PUZZLE" },
  { category: "Food & Drink", phrase: "A STEAMING BOWL OF CHICKEN SOUP" },
  { category: "Food & Drink", phrase: "FRESHLY BAKED CHOCOLATE CHIP COOKIES" },
  { category: "Food & Drink", phrase: "A TALL GLASS OF LEMONADE" },
  { category: "Food & Drink", phrase: "A CHEESY SLICE OF PEPPERONI PIZZA" },
  { category: "Food & Drink", phrase: "A SCOOP OF MINT CHOCOLATE ICE CREAM" },
  { category: "Food & Drink", phrase: "A STACK OF BUTTERMILK PANCAKES" },
  { category: "Food & Drink", phrase: "A WARM CUP OF HOT COCOA" },
  { category: "Food & Drink", phrase: "A JUICY CHEESEBURGER WITH FRIES" },
  { category: "Food & Drink", phrase: "A BOWL OF BUTTERED POPCORN" },
  { category: "Food & Drink", phrase: "A SLICE OF BIRTHDAY CAKE" },
  { category: "Food & Drink", phrase: "A SPICY BOWL OF CHILI" },
  { category: "Food & Drink", phrase: "A REFRESHING GLASS OF ICED TEA" },
  { category: "Occupation", phrase: "A DEDICATED SCHOOL TEACHER" },
  { category: "Occupation", phrase: "A LATE NIGHT RADIO HOST" },
  { category: "Occupation", phrase: "A TRAVELING CIRCUS PERFORMER" },
  { category: "Occupation", phrase: "A CURIOUS SCIENCE RESEARCHER" },
  { category: "Occupation", phrase: "A PATIENT VETERINARIAN" },
  { category: "Occupation", phrase: "A HARDWORKING FIREFIGHTER" },
  { category: "Occupation", phrase: "A FRIENDLY FLIGHT ATTENDANT" },
  { category: "Occupation", phrase: "A SKILLED FURNITURE CARPENTER" },
  { category: "Occupation", phrase: "A LOCAL WEATHER FORECASTER" },
  { category: "Occupation", phrase: "A BUSY RESTAURANT CHEF" },
  { category: "Occupation", phrase: "A TALENTED STREET MUSICIAN" },
  { category: "Around the House", phrase: "FOLDING THE LAUNDRY ON A SUNDAY" },
  { category: "Around the House", phrase: "A SQUEAKY KITCHEN CABINET DOOR" },
  { category: "Around the House", phrase: "WATERING THE HOUSEPLANTS EVERY WEEK" },
  { category: "Around the House", phrase: "A JUNK DRAWER FULL OF BATTERIES" },
  { category: "Around the House", phrase: "REARRANGING THE LIVING ROOM FURNITURE" },
  { category: "Around the House", phrase: "VACUUMING UNDER THE COUCH CUSHIONS" },
  { category: "Around the House", phrase: "A REFRIGERATOR COVERED IN MAGNETS" },
  { category: "Around the House", phrase: "TAKING OUT THE RECYCLING BINS" },
  { category: "Around the House", phrase: "A LEAKY BATHROOM FAUCET" },
  { category: "Around the House", phrase: "ORGANIZING THE GARAGE ON A SATURDAY" },
  { category: "On the Map", phrase: "A SMALL FISHING VILLAGE" },
  { category: "On the Map", phrase: "A BUSY DOWNTOWN INTERSECTION" },
  { category: "On the Map", phrase: "A WINDING MOUNTAIN HIGHWAY" },
  { category: "On the Map", phrase: "A SLEEPY SUBURBAN CUL DE SAC" },
  { category: "On the Map", phrase: "A BUSTLING CITY MARKETPLACE" },
  { category: "On the Map", phrase: "A REMOTE DESERT OUTPOST" },
  { category: "On the Map", phrase: "A QUAINT SEASIDE BOARDWALK" },
  { category: "On the Map", phrase: "A FOGGY MOUNTAIN PASS" },
  { category: "Famous Duo", phrase: "PEANUT BUTTER AND JELLY" },
  { category: "Famous Duo", phrase: "THUNDER AND LIGHTNING" },
  { category: "Famous Duo", phrase: "SALT AND PEPPER SHAKERS" },
  { category: "Famous Duo", phrase: "NEEDLE IN A HAYSTACK" },
  { category: "Famous Duo", phrase: "MACARONI AND CHEESE" },
  { category: "Famous Duo", phrase: "BACON AND EGGS" },
  { category: "Famous Duo", phrase: "SALT AND VINEGAR CHIPS" },
  { category: "Famous Duo", phrase: "COOKIES AND MILK" },
  { category: "Event", phrase: "A SURPRISE BIRTHDAY PARTY" },
  { category: "Event", phrase: "A RAINY DAY WEDDING" },
  { category: "Event", phrase: "THE ANNUAL NEIGHBORHOOD BLOCK PARTY" },
  { category: "Event", phrase: "A LAST MINUTE FAMILY REUNION" },
  { category: "Event", phrase: "A HIGH SCHOOL CLASS REUNION" },
  { category: "Event", phrase: "A BACKYARD SUMMER COOKOUT" },
  { category: "Event", phrase: "THE FIRST DAY OF SCHOOL" },
  { category: "Event", phrase: "A LATE NIGHT FIREWORKS SHOW" },
  { category: "Event", phrase: "A COMPANY HOLIDAY PARTY" },
  { category: "Sports & Games", phrase: "A LAST SECOND BUZZER BEATER" },
  { category: "Sports & Games", phrase: "A FRIENDLY GAME OF BACKYARD CATCH" },
  { category: "Sports & Games", phrase: "A CHAMPIONSHIP TROPHY CEREMONY" },
  { category: "Sports & Games", phrase: "A HEATED GAME OF CHECKERS" },
  { category: "Sports & Games", phrase: "THE HALFTIME SHOW" },
  { category: "Sports & Games", phrase: "A SUDDEN OVERTIME WIN" },
  { category: "Sports & Games", phrase: "A PICKUP GAME OF BASKETBALL" },
  { category: "Sports & Games", phrase: "A SUNDAY MORNING FISHING TRIP" },
  { category: "Technology", phrase: "A PHONE STUCK ON ONE PERCENT BATTERY" },
  { category: "Technology", phrase: "A SLOW LOADING WEBSITE" },
  { category: "Technology", phrase: "A TANGLED MESS OF CHARGING CABLES" },
  { category: "Technology", phrase: "A ROBOT VACUUM STUCK UNDER THE COUCH" },
  { category: "Technology", phrase: "A VIDEO CALL WITH A FROZEN SCREEN" },
  { category: "Technology", phrase: "A SMART SPEAKER THAT MISHEARD EVERYTHING" },
  { category: "Technology", phrase: "AN INBOX FULL OF UNREAD EMAILS" },
  { category: "School Days", phrase: "A POP QUIZ NOBODY STUDIED FOR" },
  { category: "School Days", phrase: "THE LAST BELL OF THE SCHOOL YEAR" },
  { category: "School Days", phrase: "A CROWDED SCHOOL CAFETERIA" },
  { category: "School Days", phrase: "A FIELD TRIP TO THE ZOO" },
  { category: "School Days", phrase: "A FORGOTTEN HOMEWORK ASSIGNMENT" },
  { category: "School Days", phrase: "THE ANNUAL SCIENCE FAIR" },
  { category: "School Days", phrase: "A NERVOUS FIRST DAY OF CLASS" },
  { category: "Weather", phrase: "A SUDDEN SUMMER THUNDERSTORM" },
  { category: "Weather", phrase: "THE FIRST SNOWFALL OF WINTER" },
  { category: "Weather", phrase: "A PERFECT SUNNY AFTERNOON" },
  { category: "Weather", phrase: "A FOGGY MORNING COMMUTE" },
  { category: "Weather", phrase: "A RAINBOW AFTER THE STORM" },
  { category: "Weather", phrase: "A GUSTY AUTUMN WINDSTORM" },
  { category: "Weather", phrase: "A HUMID SUMMER NIGHT" },
  { category: "Weather", phrase: "A FREEZING COLD MORNING" },
  { category: "Weather", phrase: "A HAZY SUMMER SKY" },
  { category: "Phrase", phrase: "THE SQUEAKY WHEEL GETS THE GREASE" },
  { category: "Phrase", phrase: "DONT PUT ALL YOUR EGGS IN ONE BASKET" },
  { category: "Phrase", phrase: "MAKE HAY WHILE THE SUN SHINES" },
  { category: "Phrase", phrase: "A WATCHED POT NEVER BOILS" },
  { category: "Phrase", phrase: "BEGGARS CANT BE CHOOSERS" },
  { category: "Phrase", phrase: "CURIOSITY KILLED THE CAT" },
  { category: "Phrase", phrase: "HONESTY IS THE BEST POLICY" },
  { category: "Phrase", phrase: "ABSENCE MAKES THE HEART GROW FONDER" },
  { category: "Phrase", phrase: "BETTER SAFE THAN SORRY" },
  { category: "Phrase", phrase: "DONT PUT THE CART BEFORE THE HORSE" },
  { category: "Phrase", phrase: "EASY COME EASY GO" },
  { category: "Phrase", phrase: "FOOLS RUSH IN WHERE ANGELS FEAR TO TREAD" },
  { category: "Phrase", phrase: "GOOD THINGS COME TO THOSE WHO WAIT" },
  { category: "Phrase", phrase: "HOME IS WHERE THE HEART IS" },
  { category: "Phrase", phrase: "IF THE SHOE FITS WEAR IT" },
  { category: "Phrase", phrase: "KILL TWO BIRDS WITH ONE STONE" },
  { category: "Phrase", phrase: "LAUGHTER IS THE BEST MEDICINE" },
  { category: "Phrase", phrase: "NO NEWS IS GOOD NEWS" },
  { category: "Movie Title", phrase: "THE FORGOTTEN LETTER" },
  { category: "Movie Title", phrase: "A SUMMER TO REMEMBER" },
  { category: "Movie Title", phrase: "THE HOUSE AT THE END OF THE STREET" },
  { category: "Movie Title", phrase: "MIDNIGHT AT THE CARNIVAL" },
  { category: "Movie Title", phrase: "THE OTHER SIDE OF TOWN" },
  { category: "Movie Title", phrase: "A PROMISE KEPT" },
  { category: "Movie Title", phrase: "THE LONG WAY HOME" },
  { category: "Movie Title", phrase: "SECRETS OF THE OLD MILL" },
  { category: "Movie Title", phrase: "THE FINAL CHAPTER" },
  { category: "Movie Title", phrase: "A NEW BEGINNING" },
  { category: "Movie Title", phrase: "THE ROAD NOT TAKEN" },
  { category: "Movie Title", phrase: "WHEN THE LIGHTS GO OUT" },
  { category: "Place", phrase: "A CROWDED PARKING GARAGE" },
  { category: "Place", phrase: "THE LOCAL HARDWARE STORE" },
  { category: "Place", phrase: "A QUIET COUNTRY CHURCH" },
  { category: "Place", phrase: "THE TOP OF A FERRIS WHEEL" },
  { category: "Place", phrase: "A CROWDED FOOD COURT" },
  { category: "Place", phrase: "THE LOCAL SKATE PARK" },
  { category: "Place", phrase: "A SMALL TOWN DINER" },
  { category: "Place", phrase: "THE BACK ROW OF A CLASSROOM" },
  { category: "Place", phrase: "A CROWDED AIRPORT TERMINAL" },
  { category: "Place", phrase: "THE TOP SHELF OF A CLOSET" },
  { category: "Person", phrase: "A KIND HEARTED SCHOOL NURSE" },
  { category: "Person", phrase: "THE FAMILYS FAVORITE UNCLE" },
  { category: "Person", phrase: "A DETERMINED LITTLE LEAGUE COACH" },
  { category: "Person", phrase: "THE NEIGHBORHOOD DOG WALKER" },
  { category: "Person", phrase: "A WISE OLD GRANDFATHER" },
  { category: "Person", phrase: "THE OFFICE PRACTICAL JOKER" },
  { category: "Person", phrase: "A DEVOTED SOCCER MOM" },
  { category: "Thing", phrase: "A WOBBLY KITCHEN TABLE" },
  { category: "Thing", phrase: "A SHOEBOX FULL OF RECEIPTS" },
  { category: "Thing", phrase: "A GLOW IN THE DARK STICKER" },
  { category: "Thing", phrase: "A SPARE SET OF HOUSE KEYS" },
  { category: "Thing", phrase: "A BROKEN ZIPPER ON A JACKET" },
  { category: "Thing", phrase: "A HANDFUL OF LOOSE CHANGE" },
  { category: "Thing", phrase: "A FADED FAMILY PHOTOGRAPH" },
  { category: "Thing", phrase: "A WELL WORN PAIR OF JEANS" },
  { category: "Food & Drink", phrase: "A BASKET OF FRIED CHICKEN" },
  { category: "Food & Drink", phrase: "A BOWL OF FRESH FRUIT SALAD" },
  { category: "Food & Drink", phrase: "A PLATE OF NACHOS WITH CHEESE" },
  { category: "Food & Drink", phrase: "A MUG OF FRESHLY BREWED COFFEE" },
  { category: "Food & Drink", phrase: "A BOWL OF FRUITY CEREAL" },
  { category: "Food & Drink", phrase: "A SLICE OF GARLIC BREAD" },
  { category: "Occupation", phrase: "A CHEERFUL TOUR GUIDE" },
  { category: "Occupation", phrase: "A HANDY MAINTENANCE WORKER" },
  { category: "Occupation", phrase: "A DEDICATED LIBRARY ASSISTANT" },
  { category: "Occupation", phrase: "A SKILLED SIGN LANGUAGE INTERPRETER" },
  { category: "Occupation", phrase: "A FOCUSED AIR TRAFFIC CONTROLLER" },
  { category: "Around the House", phrase: "A DRIPPING GARDEN HOSE" },
  { category: "Around the House", phrase: "A CLUTTERED COAT CLOSET" },
  { category: "Around the House", phrase: "A DUSTY CEILING FAN" },
  { category: "Around the House", phrase: "A STICKY REFRIGERATOR HANDLE" },
  { category: "Around the House", phrase: "A CREAKY STAIRCASE AT NIGHT" },
  { category: "On the Map", phrase: "A CHARMING COBBLESTONE STREET" },
  { category: "On the Map", phrase: "A CROWDED CITY SUBWAY STATION" },
  { category: "On the Map", phrase: "A PEACEFUL COUNTRY ROAD" },
  { category: "On the Map", phrase: "A BUSTLING PORT TOWN" },
  { category: "Famous Duo", phrase: "MILK AND COOKIES" },
  { category: "Famous Duo", phrase: "KETCHUP AND MUSTARD" },
  { category: "Famous Duo", phrase: "PANCAKES AND SYRUP" },
  { category: "Famous Duo", phrase: "NUTS AND BOLTS" },
  { category: "Event", phrase: "A GRADUATION CEREMONY" },
  { category: "Event", phrase: "A NEW YEARS EVE COUNTDOWN" },
  { category: "Event", phrase: "A SURPRISE BABY SHOWER" },
  { category: "Event", phrase: "A NEIGHBORHOOD GARAGE SALE" },
  { category: "Sports & Games", phrase: "A NAIL BITING PENALTY SHOOTOUT" },
  { category: "Sports & Games", phrase: "A FRIENDLY GAME OF MINI GOLF" },
  { category: "Sports & Games", phrase: "A CROWDED BOWLING ALLEY LEAGUE NIGHT" },
  { category: "Sports & Games", phrase: "A NEIGHBORHOOD GAME OF TAG" },
  { category: "Technology", phrase: "A SOFTWARE UPDATE THAT TAKES FOREVER" },
  { category: "Technology", phrase: "A GLITCHY VIDEO GAME CONTROLLER" },
  { category: "Technology", phrase: "A WIFI PASSWORD NOBODY REMEMBERS" },
  { category: "Technology", phrase: "A DOORBELL CAMERA NOTIFICATION" },
  { category: "School Days", phrase: "A CROWDED HIGH SCHOOL HALLWAY" },
  { category: "School Days", phrase: "A GROUP PROJECT NOBODY WANTED" },
  { category: "School Days", phrase: "THE SCHOOL TALENT SHOW" },
  { category: "School Days", phrase: "A LONG DIVISION WORKSHEET" },
  { category: "Holidays", phrase: "A STOCKING HUNG BY THE FIREPLACE" },
  { category: "Holidays", phrase: "A CARVED PUMPKIN ON THE PORCH" },
  { category: "Holidays", phrase: "A TABLE FULL OF THANKSGIVING FOOD" },
  { category: "Holidays", phrase: "A BASKET FULL OF EASTER EGGS" },
  { category: "Holidays", phrase: "FIREWORKS OVER THE RIVER" },
  { category: "Holidays", phrase: "A ROOM DECORATED WITH STREAMERS" },
  { category: "Nature", phrase: "A WATERFALL DEEP IN THE FOREST" },
  { category: "Nature", phrase: "A FIELD OF WILDFLOWERS" },
  { category: "Nature", phrase: "A ROCKY MOUNTAIN TRAIL" },
  { category: "Nature", phrase: "A QUIET POND AT SUNRISE" },
  { category: "Nature", phrase: "A THICK PATCH OF FOG IN THE VALLEY" },
  { category: "Nature", phrase: "A NEST HIGH IN AN OLD OAK TREE" },
];

// Tracks puzzles already used, across games, for the lifetime of this server
// process — same freshness pattern used elsewhere.
const usedPhrases = new Set<string>();

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

function pickPuzzle(): PuzzleDef {
  let pool = PUZZLE_BANK.filter((p) => !usedPhrases.has(p.phrase));
  if (pool.length === 0) {
    usedPhrases.clear();
    pool = PUZZLE_BANK;
  }
  const puzzle = pool[Math.floor(Math.random() * pool.length)]!;
  usedPhrases.add(puzzle.phrase);
  return puzzle;
}

function normalizeSolve(s: string): string {
  return s
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ");
}

function isFullyRevealed(phrase: string, guessedLetters: string[]): boolean {
  const letters = new Set(guessedLetters);
  return phrase
    .split("")
    .filter((c) => /[A-Z]/.test(c))
    .every((c) => letters.has(c));
}

export type LuckySpinPhase = "orderSpin" | "playing" | "roundEnd" | "finished";

export interface LuckySpinState {
  hostId: PlayerId;
  playerIds: PlayerId[];
  order: PlayerId[];
  turnIndex: number;
  roundIndex: number;
  totalRounds: number;
  category: string;
  phrase: string;
  guessedLetters: string[];
  roundEarnings: Record<PlayerId, number>;
  totalScores: Record<PlayerId, number>;
  phase: LuckySpinPhase;
  // A one-time spin-off, before round 1, to decide turn order — everyone
  // spins once and the highest value goes first. playerId -> the precise
  // (sub-integer) value they rolled, so ties are effectively impossible
  // when sorting even though the displayed number is a rounded 1-100.
  orderSpinValues: Record<PlayerId, number>;
  currentSegmentValue: number | null;
  lastSpinResult: WheelSegment | null;
  lastSpinIndex: number | null;
  spinEndsAt: number | null;
  // Increments on every spin action — a robust, always-unique "is this a
  // new spin" signal for the client, unlike lastSpinIndex (a wedge index,
  // 0-15, which two different spins can legitimately land on again) or
  // spinEndsAt (a millisecond timestamp, which two back-to-back spins can
  // in principle collide on).
  spinSeq: number;
  roundLog: string[];
  lastRoundResult: { winnerId: PlayerId | null; phrase: string; reason: string } | null;
}

export interface LuckySpinView {
  hostId: PlayerId;
  order: PlayerId[];
  currentPlayerId: PlayerId;
  yourTurn: boolean;
  orderSpinValues: { playerId: PlayerId; value: number }[]; // rounded for display
  orderSpinDone: boolean; // have you already spun for order?
  roundIndex: number;
  totalRounds: number;
  category: string;
  boardWords: string[][]; // each word's letters, "_" for unguessed
  revealedPhrase: string | null; // full phrase, once solved/round over
  guessedLetters: string[];
  roundEarnings: { playerId: PlayerId; amount: number }[];
  totalScores: { playerId: PlayerId; score: number }[];
  phase: LuckySpinPhase;
  currentSegmentValue: number | null;
  lastSpinResult: WheelSegment | null;
  lastSpinIndex: number | null;
  spinEndsAt: number | null;
  spinSeq: number;
  canBuyVowel: boolean;
  roundLog: string[];
  lastRoundResult: LuckySpinState["lastRoundResult"];
}

export type LuckySpinAction =
  | { type: "spinForOrder" }
  | { type: "spin" }
  | { type: "guessConsonant"; letter: string }
  | { type: "buyVowel"; letter: string }
  | { type: "solve"; text: string }
  | { type: "advance" };

// Structured per-word/per-letter board data (word breaks preserved) instead
// of a single pre-formatted ASCII string — lets the client wrap the board
// onto multiple rows at word boundaries instead of needing to horizontally
// scroll a single long line.
function buildBoardWords(phrase: string, guessedLetters: string[]): string[][] {
  const letters = new Set(guessedLetters);
  return phrase.split(" ").map((word) => word.split("").map((c) => (letters.has(c) ? c : "_")));
}

function startRound(state: LuckySpinState, roundIndex: number): LuckySpinState {
  const puzzle = pickPuzzle();
  const roundEarnings: Record<PlayerId, number> = {};
  for (const id of state.playerIds) roundEarnings[id] = 0;
  return {
    ...state,
    roundIndex,
    category: puzzle.category,
    phrase: puzzle.phrase,
    guessedLetters: [],
    roundEarnings,
    phase: "playing",
    currentSegmentValue: null,
    lastSpinResult: null,
    lastSpinIndex: null,
    spinEndsAt: null,
    roundLog: [`Round ${roundIndex + 1}: category is "${puzzle.category}"`],
    lastRoundResult: null,
  };
}

function passTurn(state: LuckySpinState): Pick<LuckySpinState, "turnIndex" | "currentSegmentValue"> {
  return { turnIndex: (state.turnIndex + 1) % state.order.length, currentSegmentValue: null };
}

export const luckySpin: GameDefinition<LuckySpinState, LuckySpinView, LuckySpinAction> = {
  meta: {
    id: "lucky-spin",
    name: "Lucky Spin",
    tagline: "Spin the wheel, guess letters, solve the puzzle before anyone else.",
    category: "party",
    minPlayers: 2,
    maxPlayers: 6,
    options: [{ key: "rounds", label: "Rounds", type: "number", min: 2, max: 10, default: DEFAULT_ROUNDS }],
  },
  createInitialState(players, options: GameOptions) {
    const host = players.find((p) => p.isHost) ?? players[0]!;
    const order = players.map((p) => p.id);
    const totalScores: Record<PlayerId, number> = {};
    for (const p of players) totalScores[p.id] = 0;
    const totalRounds = Math.min(Math.max(Number(options.rounds) || DEFAULT_ROUNDS, 2), 10);
    const base: LuckySpinState = {
      hostId: host.id,
      playerIds: order,
      order,
      turnIndex: 0,
      roundIndex: 0,
      totalRounds,
      category: "",
      phrase: "",
      guessedLetters: [],
      roundEarnings: {},
      totalScores,
      phase: "orderSpin",
      orderSpinValues: {},
      currentSegmentValue: null,
      lastSpinResult: null,
      lastSpinIndex: null,
      spinEndsAt: null,
      spinSeq: 0,
      roundLog: [],
      lastRoundResult: null,
    };
    return base;
  },
  applyAction(state, playerId, action) {
    if (state.phase === "finished") throw new GameActionError("Game is already over.");

    if (action.type === "spinForOrder") {
      if (state.phase !== "orderSpin") throw new GameActionError("Turn order is already set.");
      if (!state.playerIds.includes(playerId)) throw new GameActionError("Unknown player.");
      if (playerId in state.orderSpinValues) throw new GameActionError("You've already spun for turn order.");
      const value = Math.random() * 100;
      const orderSpinValues = { ...state.orderSpinValues, [playerId]: value };
      const allDone = state.playerIds.every((id) => id in orderSpinValues);
      if (!allDone) {
        return { ...state, orderSpinValues };
      }
      // Highest value goes first, then play proceeds in that same order —
      // just a fixed re-ranking of playerIds, not a rotating "next turn"
      // pick, so the rest of the game's turnIndex-based logic is untouched.
      const order = [...state.playerIds].sort((a, b) => (orderSpinValues[b] ?? 0) - (orderSpinValues[a] ?? 0));
      return startRound({ ...state, orderSpinValues, order, turnIndex: 0 }, 0);
    }

    const currentPlayerId = state.order[state.turnIndex]!;

    if (action.type === "spin") {
      if (state.phase !== "playing") throw new GameActionError("Not your turn to spin.");
      if (playerId !== currentPlayerId) throw new GameActionError("It's not your turn.");
      if (state.currentSegmentValue !== null) throw new GameActionError("You already spun — guess a consonant, buy a vowel, or solve.");
      const segmentIndex = Math.floor(Math.random() * WHEEL.length);
      const segment = WHEEL[segmentIndex]!;

      if (segment === "BANKRUPT") {
        const roundEarnings = { ...state.roundEarnings, [currentPlayerId]: 0 };
        return {
          ...state,
          roundEarnings,
          lastSpinResult: segment,
          lastSpinIndex: segmentIndex,
          spinEndsAt: Date.now() + SPIN_DURATION_MS,
          spinSeq: state.spinSeq + 1,
          ...passTurn(state),
          roundLog: [...state.roundLog, `${currentPlayerId} spun BANKRUPT and loses this round's earnings!`].slice(-30),
        };
      }
      if (segment === "LOSE_TURN") {
        return {
          ...state,
          lastSpinResult: segment,
          lastSpinIndex: segmentIndex,
          spinEndsAt: Date.now() + SPIN_DURATION_MS,
          spinSeq: state.spinSeq + 1,
          ...passTurn(state),
          roundLog: [...state.roundLog, `${currentPlayerId} spun Lose a Turn.`].slice(-30),
        };
      }
      return {
        ...state,
        currentSegmentValue: segment,
        lastSpinResult: segment,
        lastSpinIndex: segmentIndex,
        spinEndsAt: Date.now() + SPIN_DURATION_MS,
        spinSeq: state.spinSeq + 1,
        roundLog: [...state.roundLog, `${currentPlayerId} spun $${segment}.`].slice(-30),
      };
    }

    if (action.type === "guessConsonant") {
      if (state.phase !== "playing") throw new GameActionError("Round's over.");
      if (playerId !== currentPlayerId) throw new GameActionError("It's not your turn.");
      if (state.currentSegmentValue === null) throw new GameActionError("Spin first.");
      const letter = action.letter.trim().toUpperCase();
      if (!/^[A-Z]$/.test(letter) || VOWELS.has(letter)) throw new GameActionError("Pick a single consonant.");
      if (state.guessedLetters.includes(letter)) throw new GameActionError("That letter's already been guessed.");

      const value = state.currentSegmentValue;
      const count = state.phrase.split("").filter((c) => c === letter).length;
      const guessedLetters = [...state.guessedLetters, letter];

      if (count > 0) {
        const roundEarnings = { ...state.roundEarnings, [currentPlayerId]: (state.roundEarnings[currentPlayerId] ?? 0) + value * count };
        const log = [...state.roundLog, `${currentPlayerId} found ${count} "${letter}"${count > 1 ? "'s" : ""} — +$${value * count}!`].slice(-30);
        if (isFullyRevealed(state.phrase, guessedLetters)) {
          return endRound({ ...state, guessedLetters, roundEarnings, roundLog: log }, currentPlayerId, "board fully revealed");
        }
        return { ...state, guessedLetters, roundEarnings, currentSegmentValue: null, roundLog: log };
      }

      return {
        ...state,
        guessedLetters,
        roundLog: [...state.roundLog, `${currentPlayerId} guessed "${letter}" — not in the puzzle.`].slice(-30),
        ...passTurn(state),
      };
    }

    if (action.type === "buyVowel") {
      if (state.phase !== "playing") throw new GameActionError("Round's over.");
      if (playerId !== currentPlayerId) throw new GameActionError("It's not your turn.");
      const letter = action.letter.trim().toUpperCase();
      if (!VOWELS.has(letter)) throw new GameActionError("Pick a vowel.");
      if (state.guessedLetters.includes(letter)) throw new GameActionError("That letter's already been guessed.");
      const earnings = state.roundEarnings[currentPlayerId] ?? 0;
      if (earnings < VOWEL_COST) throw new GameActionError(`You need $${VOWEL_COST} to buy a vowel.`);

      const roundEarnings = { ...state.roundEarnings, [currentPlayerId]: earnings - VOWEL_COST };
      const count = state.phrase.split("").filter((c) => c === letter).length;
      const guessedLetters = [...state.guessedLetters, letter];

      if (count > 0) {
        const log = [...state.roundLog, `${currentPlayerId} bought "${letter}" for $${VOWEL_COST} — found ${count}.`].slice(-30);
        if (isFullyRevealed(state.phrase, guessedLetters)) {
          return endRound({ ...state, guessedLetters, roundEarnings, roundLog: log }, currentPlayerId, "board fully revealed");
        }
        return { ...state, guessedLetters, roundEarnings, roundLog: log };
      }

      return {
        ...state,
        guessedLetters,
        roundEarnings,
        roundLog: [...state.roundLog, `${currentPlayerId} bought "${letter}" for $${VOWEL_COST} — not in the puzzle.`].slice(-30),
        ...passTurn(state),
      };
    }

    if (action.type === "solve") {
      if (state.phase !== "playing") throw new GameActionError("Round's over.");
      if (playerId !== currentPlayerId) throw new GameActionError("It's not your turn.");
      const text = normalizeSolve(action.text);
      if (!text) throw new GameActionError("Enter your solve attempt.");
      if (text === normalizeSolve(state.phrase)) {
        return endRound(state, currentPlayerId, "solved it");
      }
      return {
        ...state,
        roundLog: [...state.roundLog, `${currentPlayerId} guessed "${action.text}" — not quite.`].slice(-30),
        ...passTurn(state),
      };
    }

    if (action.type === "advance") {
      if (playerId !== state.hostId) throw new GameActionError("Only the host can advance the game.");
      if (state.phase !== "roundEnd") throw new GameActionError("Nothing to advance.");
      const nextRoundIndex = state.roundIndex + 1;
      if (nextRoundIndex >= state.totalRounds) return { ...state, phase: "finished" };
      return startRound(state, nextRoundIndex);
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId, players) {
    const currentPlayerId = state.order[state.turnIndex]!;
    const revealed = state.phase === "roundEnd" || state.phase === "finished";
    return {
      hostId: state.hostId,
      order: state.order,
      currentPlayerId,
      yourTurn: currentPlayerId === playerId && state.phase === "playing",
      orderSpinValues: state.playerIds
        .filter((pid) => pid in state.orderSpinValues)
        .map((pid) => ({ playerId: pid, value: Math.round(state.orderSpinValues[pid]!) })),
      orderSpinDone: playerId in state.orderSpinValues,
      roundIndex: state.roundIndex,
      totalRounds: state.totalRounds,
      category: state.category,
      boardWords: buildBoardWords(state.phrase, state.guessedLetters),
      revealedPhrase: revealed ? state.phrase : null,
      guessedLetters: state.guessedLetters,
      roundEarnings: state.playerIds.map((pid) => ({ playerId: pid, amount: state.roundEarnings[pid] ?? 0 })),
      totalScores: state.playerIds.map((pid) => ({ playerId: pid, score: state.totalScores[pid] ?? 0 })),
      phase: state.phase,
      currentSegmentValue: state.currentSegmentValue,
      lastSpinResult: state.lastSpinResult,
      lastSpinIndex: state.lastSpinIndex,
      spinEndsAt: state.spinEndsAt,
      spinSeq: state.spinSeq,
      canBuyVowel: (state.roundEarnings[currentPlayerId] ?? 0) >= VOWEL_COST,
      roundLog: substituteNames(state.roundLog.slice(-8), state.order, players),
      lastRoundResult: state.lastRoundResult,
    };
  },
  isGameOver(state) {
    return state.phase === "finished";
  },
  getWinnerIds(state) {
    if (state.phase !== "finished") return [];
    const max = Math.max(...Object.values(state.totalScores));
    return Object.entries(state.totalScores)
      .filter(([, v]) => v === max)
      .map(([k]) => k);
  },
  getRanking(state) {
    return [...state.playerIds].sort((a, b) => (state.totalScores[b] ?? 0) - (state.totalScores[a] ?? 0));
  },
};

function endRound(state: LuckySpinState, winnerId: PlayerId, reason: string): LuckySpinState {
  const totalScores = { ...state.totalScores, [winnerId]: (state.totalScores[winnerId] ?? 0) + (state.roundEarnings[winnerId] ?? 0) };
  return {
    ...state,
    totalScores,
    phase: "roundEnd",
    lastRoundResult: { winnerId, phrase: state.phrase, reason },
    roundLog: [...state.roundLog, `${winnerId} wins the round — ${reason}! Banks $${state.roundEarnings[winnerId] ?? 0}.`].slice(-30),
  };
}
