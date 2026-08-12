import { GameActionError, GameDefinition, GameOptions, PlayerId, PlayerInfo } from "@/lib/types";
import { assignTeams } from "./teamAssign";

// A simplified Family Feud: two teams, survey questions with ranked hidden
// answers, a buzz-in face-off to win control of the board, and a steal
// mechanic. Simplification vs. the TV show: the face-off winner always plays
// (no play/pass choice), and a steal is a single shared guess for the team.

type TeamId = "A" | "B";

interface FeudAnswerDef {
  text: string;
  points: number;
  matches: string[]; // lowercase accepted variants, always includes `text`
}

interface FeudQuestionDef {
  prompt: string;
  answers: FeudAnswerDef[];
}

const QUESTION_BANK: FeudQuestionDef[] = [
  {
    prompt: "Name something you'd bring on a picnic.",
    answers: [
      { text: "Sandwiches", points: 32, matches: ["sandwiches", "sandwich", "food"] },
      { text: "Blanket", points: 26, matches: ["blanket", "picnic blanket"] },
      { text: "Drinks", points: 18, matches: ["drinks", "soda", "water", "beverages"] },
      { text: "Chips", points: 14, matches: ["chips", "snacks"] },
      { text: "Bug spray", points: 10, matches: ["bug spray", "bugspray", "insect repellent"] },
    ],
  },
  {
    prompt: "Name a reason someone would be late to work.",
    answers: [
      { text: "Traffic", points: 35, matches: ["traffic", "traffic jam"] },
      { text: "Overslept", points: 27, matches: ["overslept", "slept in", "alarm didn't go off"] },
      { text: "Car trouble", points: 16, matches: ["car trouble", "car broke down", "flat tire"] },
      { text: "Kids", points: 12, matches: ["kids", "children", "dropping off kids"] },
      { text: "Bad weather", points: 10, matches: ["bad weather", "weather", "storm", "snow"] },
    ],
  },
  {
    prompt: "Name something people do when they can't sleep.",
    answers: [
      { text: "Watch TV", points: 30, matches: ["watch tv", "tv", "watch television", "netflix"] },
      { text: "Scroll their phone", points: 25, matches: ["scroll phone", "phone", "scroll on phone", "social media"] },
      { text: "Count sheep", points: 18, matches: ["count sheep", "counting sheep"] },
      { text: "Read a book", points: 15, matches: ["read", "read a book", "book", "reading"] },
      { text: "Get a snack", points: 12, matches: ["snack", "get a snack", "eat"] },
    ],
  },
  {
    prompt: "Name an animal you'd see at the zoo.",
    answers: [
      { text: "Lion", points: 28, matches: ["lion"] },
      { text: "Elephant", points: 24, matches: ["elephant"] },
      { text: "Giraffe", points: 20, matches: ["giraffe"] },
      { text: "Monkey", points: 16, matches: ["monkey", "ape", "gorilla"] },
      { text: "Penguin", points: 12, matches: ["penguin"] },
    ],
  },
  {
    prompt: "Name something you take with you to the beach.",
    answers: [
      { text: "Towel", points: 30, matches: ["towel", "beach towel"] },
      { text: "Sunscreen", points: 26, matches: ["sunscreen", "sunblock"] },
      { text: "Umbrella", points: 18, matches: ["umbrella", "beach umbrella"] },
      { text: "Cooler", points: 14, matches: ["cooler", "ice chest", "drinks cooler"] },
      { text: "Sunglasses", points: 12, matches: ["sunglasses", "shades"] },
    ],
  },
  {
    prompt: "Name a job where you have to wear a uniform.",
    answers: [
      { text: "Police officer", points: 27, matches: ["police officer", "police", "cop"] },
      { text: "Nurse", points: 23, matches: ["nurse", "doctor", "medical"] },
      { text: "Firefighter", points: 19, matches: ["firefighter", "fireman", "fire fighter"] },
      { text: "Soldier", points: 17, matches: ["soldier", "military", "army"] },
      { text: "Chef", points: 14, matches: ["chef", "cook"] },
    ],
  },
  {
    prompt: "Name something you do to relax after a long day.",
    answers: [
      { text: "Take a shower/bath", points: 26, matches: ["shower", "bath", "take a shower", "take a bath"] },
      { text: "Watch TV", points: 22, matches: ["watch tv", "tv", "netflix"] },
      { text: "Nap", points: 20, matches: ["nap", "sleep", "lie down"] },
      { text: "Exercise", points: 17, matches: ["exercise", "workout", "gym", "run"] },
      { text: "Have a drink", points: 15, matches: ["drink", "have a drink", "wine", "beer", "alcohol"] },
    ],
  },
  {
    prompt: "Name something people are scared of.",
    answers: [
      { text: "Spiders", points: 29, matches: ["spiders", "spider"] },
      { text: "Heights", points: 24, matches: ["heights", "being high up"] },
      { text: "Snakes", points: 20, matches: ["snakes", "snake"] },
      { text: "The dark", points: 15, matches: ["the dark", "dark", "darkness"] },
      { text: "Public speaking", points: 12, matches: ["public speaking", "speaking in public"] },
    ],
  },
  {
    prompt: "Name a food people eat for breakfast.",
    answers: [
      { text: "Eggs", points: 28, matches: ["eggs", "egg"] },
      { text: "Cereal", points: 24, matches: ["cereal"] },
      { text: "Toast", points: 18, matches: ["toast", "bread"] },
      { text: "Pancakes", points: 16, matches: ["pancakes", "waffles"] },
      { text: "Coffee", points: 14, matches: ["coffee"] },
    ],
  },
  {
    prompt: "Name something you'd find in a junk drawer.",
    answers: [
      { text: "Batteries", points: 25, matches: ["batteries", "battery"] },
      { text: "Rubber bands", points: 22, matches: ["rubber bands", "rubber band"] },
      { text: "Old receipts", points: 19, matches: ["receipts", "old receipts", "paper"] },
      { text: "Tape", points: 18, matches: ["tape", "scotch tape"] },
      { text: "Random keys", points: 16, matches: ["keys", "random keys", "old keys"] },
    ],
  },
  {
    prompt: "Name a reason someone would call in sick to work.",
    answers: [
      { text: "Cold or flu", points: 34, matches: ["cold", "flu", "sick", "cold or flu"] },
      { text: "Hangover", points: 22, matches: ["hangover", "hungover"] },
      { text: "Doctor's appointment", points: 18, matches: ["doctor", "doctor's appointment", "appointment"] },
      { text: "Mental health day", points: 15, matches: ["mental health day", "mental health", "burnout"] },
      { text: "Sick kid", points: 11, matches: ["sick kid", "kid is sick", "child is sick"] },
    ],
  },
  {
    prompt: "Name something you do before going to bed.",
    answers: [
      { text: "Brush your teeth", points: 33, matches: ["brush teeth", "brush your teeth", "teeth"] },
      { text: "Scroll your phone", points: 24, matches: ["phone", "scroll phone", "social media"] },
      { text: "Set an alarm", points: 18, matches: ["alarm", "set an alarm"] },
      { text: "Read", points: 14, matches: ["read", "reading", "read a book"] },
      { text: "Lock the doors", points: 11, matches: ["lock doors", "lock the doors", "locking up"] },
    ],
  },
  {
    prompt: "Name a popular pizza topping.",
    answers: [
      { text: "Pepperoni", points: 36, matches: ["pepperoni"] },
      { text: "Cheese", points: 22, matches: ["cheese", "extra cheese"] },
      { text: "Mushrooms", points: 15, matches: ["mushrooms", "mushroom"] },
      { text: "Sausage", points: 14, matches: ["sausage"] },
      { text: "Pineapple", points: 13, matches: ["pineapple"] },
    ],
  },
  {
    prompt: "Name something you'd take on a road trip.",
    answers: [
      { text: "Snacks", points: 30, matches: ["snacks", "food"] },
      { text: "Phone charger", points: 24, matches: ["charger", "phone charger"] },
      { text: "Music/playlist", points: 19, matches: ["music", "playlist", "aux cord"] },
      { text: "Pillow", points: 15, matches: ["pillow", "neck pillow"] },
      { text: "GPS/maps", points: 12, matches: ["gps", "maps", "navigation"] },
    ],
  },
  {
    prompt: "Name something people are addicted to.",
    answers: [
      { text: "Coffee", points: 27, matches: ["coffee", "caffeine"] },
      { text: "Phones/social media", points: 25, matches: ["phone", "social media", "phones"] },
      { text: "Sugar", points: 18, matches: ["sugar", "sweets", "candy"] },
      { text: "Video games", points: 16, matches: ["video games", "gaming"] },
      { text: "Cigarettes", points: 14, matches: ["cigarettes", "smoking", "nicotine"] },
    ],
  },
  {
    prompt: "Name something a superhero has.",
    answers: [
      { text: "A cape", points: 30, matches: ["cape"] },
      { text: "Superpowers", points: 26, matches: ["superpowers", "powers"] },
      { text: "A mask", points: 18, matches: ["mask"] },
      { text: "A secret identity", points: 15, matches: ["secret identity", "identity", "alter ego"] },
      { text: "A sidekick", points: 11, matches: ["sidekick"] },
    ],
  },
  {
    prompt: "Name something you'd find at a birthday party.",
    answers: [
      { text: "Cake", points: 35, matches: ["cake", "birthday cake"] },
      { text: "Balloons", points: 24, matches: ["balloons", "balloon"] },
      { text: "Presents", points: 18, matches: ["presents", "gifts"] },
      { text: "Candles", points: 13, matches: ["candles", "candle"] },
      { text: "Music", points: 10, matches: ["music"] },
    ],
  },
  {
    prompt: "Name something you'd complain about at a hotel.",
    answers: [
      { text: "Noisy neighbors", points: 26, matches: ["noise", "noisy neighbors", "loud"] },
      { text: "Uncomfortable bed", points: 22, matches: ["bed", "uncomfortable bed", "mattress"] },
      { text: "Slow wifi", points: 18, matches: ["wifi", "slow wifi", "internet"] },
      { text: "Dirty room", points: 17, matches: ["dirty", "dirty room", "cleanliness"] },
      { text: "Bad AC/heat", points: 13, matches: ["ac", "heat", "temperature"] },
    ],
  },
  {
    prompt: "Name a reason you'd return an item to a store.",
    answers: [
      { text: "It doesn't fit", points: 32, matches: ["doesn't fit", "wrong size", "fit"] },
      { text: "It's damaged/broken", points: 24, matches: ["damaged", "broken", "defective"] },
      { text: "Changed your mind", points: 18, matches: ["changed my mind", "changed mind", "don't want it"] },
      { text: "Wrong color", points: 14, matches: ["wrong color", "color"] },
      { text: "Found it cheaper elsewhere", points: 12, matches: ["cheaper", "found it cheaper", "price"] },
    ],
  },
  {
    prompt: "Name a chore people hate doing.",
    answers: [
      { text: "Cleaning the bathroom", points: 28, matches: ["bathroom", "cleaning bathroom", "toilet"] },
      { text: "Doing dishes", points: 24, matches: ["dishes", "washing dishes"] },
      { text: "Laundry", points: 20, matches: ["laundry"] },
      { text: "Vacuuming", points: 15, matches: ["vacuuming", "vacuum"] },
      { text: "Taking out the trash", points: 13, matches: ["trash", "taking out trash", "garbage"] },
    ],
  },
  {
    prompt: "Name something you'd see in a classroom.",
    answers: [
      { text: "Desks", points: 27, matches: ["desks", "desk"] },
      { text: "Whiteboard", points: 24, matches: ["whiteboard", "chalkboard", "board"] },
      { text: "Students", points: 18, matches: ["students", "kids"] },
      { text: "Books", points: 17, matches: ["books"] },
      { text: "A clock", points: 14, matches: ["clock"] },
    ],
  },
  {
    prompt: "Name something you do to celebrate a win.",
    answers: [
      { text: "Cheer/scream", points: 28, matches: ["cheer", "scream", "yell"] },
      { text: "High-five", points: 22, matches: ["high five", "high-five"] },
      { text: "Go out to eat", points: 20, matches: ["go out to eat", "dinner", "eat out"] },
      { text: "Post about it online", points: 16, matches: ["post online", "social media", "post about it"] },
      { text: "Have a drink", points: 14, matches: ["drink", "have a drink", "champagne"] },
    ],
  },
  {
    prompt: "Name a movie snack.",
    answers: [
      { text: "Popcorn", points: 40, matches: ["popcorn"] },
      { text: "Candy", points: 22, matches: ["candy"] },
      { text: "Nachos", points: 15, matches: ["nachos"] },
      { text: "Soda", points: 13, matches: ["soda", "soft drink"] },
      { text: "Pretzel", points: 10, matches: ["pretzel"] },
    ],
  },
  {
    prompt: "Name something you'd forget if you were in a rush.",
    answers: [
      { text: "Your phone", points: 26, matches: ["phone"] },
      { text: "Your keys", points: 24, matches: ["keys"] },
      { text: "Your wallet", points: 20, matches: ["wallet"] },
      { text: "Your lunch", points: 16, matches: ["lunch", "food"] },
      { text: "Your umbrella", points: 14, matches: ["umbrella"] },
    ],
  },
  {
    prompt: "Name a food you'd eat at Thanksgiving.",
    answers: [
      { text: "Turkey", points: 38, matches: ["turkey"] },
      { text: "Mashed potatoes", points: 22, matches: ["mashed potatoes", "potatoes"] },
      { text: "Stuffing", points: 16, matches: ["stuffing", "dressing"] },
      { text: "Cranberry sauce", points: 13, matches: ["cranberry sauce", "cranberries"] },
      { text: "Pumpkin pie", points: 11, matches: ["pumpkin pie", "pie"] },
    ],
  },
  {
    prompt: "Name something you do to prepare for a hurricane or big storm.",
    answers: [
      { text: "Stock up on water", points: 28, matches: ["water", "stock up water", "bottled water"] },
      { text: "Buy batteries/flashlights", points: 24, matches: ["batteries", "flashlights"] },
      { text: "Board up windows", points: 20, matches: ["board up windows", "windows"] },
      { text: "Fill up on gas", points: 15, matches: ["gas", "fill up on gas"] },
      { text: "Charge your phone", points: 13, matches: ["charge phone", "charge your phone"] },
    ],
  },
  {
    prompt: "Name something you'd see at a wedding.",
    answers: [
      { text: "The bride's dress", points: 28, matches: ["dress", "wedding dress", "bride's dress"] },
      { text: "A cake", points: 24, matches: ["cake", "wedding cake"] },
      { text: "Flowers", points: 18, matches: ["flowers", "bouquet"] },
      { text: "Dancing", points: 16, matches: ["dancing", "dance floor"] },
      { text: "Crying relatives", points: 14, matches: ["crying", "crying relatives", "tears"] },
    ],
  },
  {
    prompt: "Name a reason a baby would cry.",
    answers: [
      { text: "They're hungry", points: 30, matches: ["hungry"] },
      { text: "Dirty diaper", points: 24, matches: ["diaper", "dirty diaper"] },
      { text: "They're tired", points: 20, matches: ["tired", "sleepy"] },
      { text: "Teething", points: 14, matches: ["teething", "teeth"] },
      { text: "They want attention", points: 12, matches: ["attention", "wants attention"] },
    ],
  },
  {
    prompt: "Name something you do when you're bored at work.",
    answers: [
      { text: "Scroll your phone", points: 30, matches: ["phone", "scroll phone", "social media"] },
      { text: "Chat with coworkers", points: 24, matches: ["chat with coworkers", "talk to coworkers", "gossip"] },
      { text: "Snack", points: 18, matches: ["snack", "eat", "get a snack"] },
      { text: "Browse the internet", points: 16, matches: ["internet", "browse internet", "shop online"] },
      { text: "Daydream", points: 12, matches: ["daydream", "zone out"] },
    ],
  },
  {
    prompt: "Name a household pet.",
    answers: [
      { text: "Dog", points: 42, matches: ["dog"] },
      { text: "Cat", points: 32, matches: ["cat"] },
      { text: "Fish", points: 12, matches: ["fish"] },
      { text: "Bird", points: 8, matches: ["bird"] },
      { text: "Hamster", points: 6, matches: ["hamster", "gerbil"] },
    ],
  },
  {
    prompt: "Name something you'd bring to a job interview.",
    answers: [
      { text: "Resume", points: 34, matches: ["resume", "cv"] },
      { text: "Confidence", points: 20, matches: ["confidence"] },
      { text: "A pen", points: 16, matches: ["pen"] },
      { text: "References", points: 15, matches: ["references"] },
      { text: "A firm handshake", points: 15, matches: ["handshake", "firm handshake"] },
    ],
  },
  {
    prompt: "Name something that's hard to do with your eyes closed.",
    answers: [
      { text: "Drive", points: 30, matches: ["drive", "driving"] },
      { text: "Walk in a straight line", points: 24, matches: ["walk straight", "walk in a straight line"] },
      { text: "Read", points: 18, matches: ["read", "reading"] },
      { text: "Cook", points: 15, matches: ["cook", "cooking"] },
      { text: "Thread a needle", points: 13, matches: ["thread a needle", "sewing"] },
    ],
  },
  {
    prompt: "Name a reason to call in a plumber.",
    answers: [
      { text: "A leaky pipe", points: 30, matches: ["leaky pipe", "leak", "pipe leaking"] },
      { text: "A clogged toilet", points: 26, matches: ["clogged toilet", "toilet"] },
      { text: "No hot water", points: 18, matches: ["no hot water", "water heater"] },
      { text: "A clogged drain", points: 15, matches: ["clogged drain", "drain"] },
      { text: "Low water pressure", points: 11, matches: ["low water pressure", "water pressure"] },
    ],
  },
  {
    prompt: "Name something you'd find at the beach.",
    answers: [
      { text: "Sand", points: 32, matches: ["sand"] },
      { text: "Seashells", points: 22, matches: ["seashells", "shells"] },
      { text: "Waves", points: 18, matches: ["waves", "ocean"] },
      { text: "Seagulls", points: 15, matches: ["seagulls", "birds"] },
      { text: "Sunbathers", points: 13, matches: ["sunbathers", "people tanning"] },
    ],
  },
  {
    prompt: "Name a reason someone might go to the emergency room.",
    answers: [
      { text: "A broken bone", points: 28, matches: ["broken bone", "fracture"] },
      { text: "Chest pains", points: 24, matches: ["chest pains", "heart"] },
      { text: "A bad cut", points: 20, matches: ["cut", "bad cut", "bleeding"] },
      { text: "A high fever", points: 15, matches: ["fever", "high fever"] },
      { text: "Food poisoning", points: 13, matches: ["food poisoning"] },
    ],
  },
  {
    prompt: "Name something you'd pack for the gym.",
    answers: [
      { text: "A water bottle", points: 28, matches: ["water bottle", "water"] },
      { text: "A towel", points: 24, matches: ["towel"] },
      { text: "Workout clothes", points: 20, matches: ["workout clothes", "gym clothes"] },
      { text: "Headphones", points: 16, matches: ["headphones", "earbuds"] },
      { text: "Sneakers", points: 12, matches: ["sneakers", "shoes"] },
    ],
  },
  {
    prompt: "Name a game people play at a party.",
    answers: [
      { text: "Charades", points: 26, matches: ["charades"] },
      { text: "Cards", points: 24, matches: ["cards", "card games"] },
      { text: "Beer pong", points: 20, matches: ["beer pong"] },
      { text: "Trivia", points: 16, matches: ["trivia"] },
      { text: "Twister", points: 14, matches: ["twister"] },
    ],
  },
  {
    prompt: "Name something you do on a Sunday.",
    answers: [
      { text: "Relax", points: 26, matches: ["relax", "rest"] },
      { text: "Watch sports", points: 24, matches: ["watch sports", "football"] },
      { text: "Meal prep", points: 18, matches: ["meal prep", "cook"] },
      { text: "Go to church", points: 17, matches: ["church"] },
      { text: "Do laundry", points: 15, matches: ["laundry"] },
    ],
  },
  {
    prompt: "Name something people are afraid to ask their boss.",
    answers: [
      { text: "For a raise", points: 34, matches: ["raise", "for a raise"] },
      { text: "For time off", points: 24, matches: ["time off", "vacation"] },
      { text: "For a promotion", points: 18, matches: ["promotion"] },
      { text: "To work from home", points: 14, matches: ["work from home", "remote work"] },
      { text: "To leave early", points: 10, matches: ["leave early"] },
    ],
  },
  {
    prompt: "Name a reason your neighbors might complain about you.",
    answers: [
      { text: "Loud music", points: 30, matches: ["loud music", "noise", "music too loud"] },
      { text: "A barking dog", points: 22, matches: ["barking dog", "dog barking"] },
      { text: "A messy yard", points: 18, matches: ["messy yard", "yard"] },
      { text: "Parking issues", points: 16, matches: ["parking", "parking issues"] },
      { text: "A late-night party", points: 14, matches: ["party", "late night party"] },
    ],
  },
  {
    prompt: "Name something you do to stay cool in the summer.",
    answers: [
      { text: "Turn on the AC", points: 30, matches: ["ac", "air conditioning"] },
      { text: "Go swimming", points: 24, matches: ["swimming", "go swimming", "pool"] },
      { text: "Drink cold drinks", points: 18, matches: ["cold drinks", "drink water"] },
      { text: "Wear light clothing", points: 14, matches: ["light clothing", "wear less"] },
      { text: "Eat ice cream", points: 14, matches: ["ice cream"] },
    ],
  },
  {
    prompt: "Name something you might name a pet.",
    answers: [
      { text: "Max", points: 22, matches: ["max"] },
      { text: "Bella", points: 20, matches: ["bella"] },
      { text: "Buddy", points: 18, matches: ["buddy"] },
      { text: "Charlie", points: 16, matches: ["charlie"] },
      { text: "Luna", points: 14, matches: ["luna"] },
    ],
  },
  {
    prompt: "Name a reason someone would be nervous on a first date.",
    answers: [
      { text: "Fear of awkward silence", points: 26, matches: ["awkward silence", "silence", "nothing to say"] },
      { text: "What to wear", points: 22, matches: ["what to wear", "outfit"] },
      { text: "Being judged", points: 20, matches: ["being judged", "judged", "first impression"] },
      { text: "Bad breath", points: 16, matches: ["bad breath"] },
      { text: "Who pays the bill", points: 16, matches: ["paying the bill", "who pays"] },
    ],
  },
  {
    prompt: "Name something you'd find in a school backpack.",
    answers: [
      { text: "Notebooks", points: 26, matches: ["notebooks", "notebook"] },
      { text: "Pencils/pens", points: 24, matches: ["pencils", "pens"] },
      { text: "A laptop/tablet", points: 18, matches: ["laptop", "tablet", "computer"] },
      { text: "A lunchbox", points: 17, matches: ["lunchbox", "lunch"] },
      { text: "Textbooks", points: 15, matches: ["textbooks", "books"] },
    ],
  },
  {
    prompt: "Name something you do to pass time on a long flight.",
    answers: [
      { text: "Watch a movie", points: 28, matches: ["watch a movie", "movie"] },
      { text: "Sleep", points: 26, matches: ["sleep", "nap"] },
      { text: "Read", points: 18, matches: ["read", "reading"] },
      { text: "Listen to music/podcasts", points: 16, matches: ["music", "podcasts", "listen to music"] },
      { text: "Talk to the person next to you", points: 12, matches: ["talk to seatmate", "talk to person next to you"] },
    ],
  },
  {
    prompt: "Name something that's better homemade than store-bought.",
    answers: [
      { text: "Cookies", points: 24, matches: ["cookies"] },
      { text: "Bread", points: 22, matches: ["bread"] },
      { text: "Pizza", points: 20, matches: ["pizza"] },
      { text: "Soup", points: 18, matches: ["soup"] },
      { text: "Salsa", points: 16, matches: ["salsa"] },
    ],
  },
  {
    prompt: "Name something you'd see at a farmers market.",
    answers: [
      { text: "Fresh vegetables", points: 30, matches: ["vegetables", "fresh vegetables", "produce"] },
      { text: "Fruit", points: 24, matches: ["fruit"] },
      { text: "Homemade honey/jam", points: 18, matches: ["honey", "jam"] },
      { text: "Flowers", points: 14, matches: ["flowers"] },
      { text: "Live music", points: 14, matches: ["live music", "music"] },
    ],
  },
  {
    prompt: "Name a reason to skip the gym.",
    answers: [
      { text: "Too tired", points: 28, matches: ["too tired", "tired"] },
      { text: "No time", points: 26, matches: ["no time", "busy"] },
      { text: "Sore muscles", points: 18, matches: ["sore", "sore muscles"] },
      { text: "Bad weather", points: 14, matches: ["bad weather", "weather"] },
      { text: "Just don't feel like it", points: 14, matches: ["don't feel like it", "lazy"] },
    ],
  },
  {
    prompt: "Name a popular ice cream flavor.",
    answers: [
      { text: "Chocolate", points: 32, matches: ["chocolate"] },
      { text: "Vanilla", points: 28, matches: ["vanilla"] },
      { text: "Strawberry", points: 16, matches: ["strawberry"] },
      { text: "Mint chocolate chip", points: 13, matches: ["mint chocolate chip", "mint chip"] },
      { text: "Cookies and cream", points: 11, matches: ["cookies and cream", "cookies n cream"] },
    ],
  },
  {
    prompt: "Name something you'd do on a first day at a new job.",
    answers: [
      { text: "Meet your coworkers", points: 28, matches: ["meet coworkers", "meet your coworkers"] },
      { text: "Fill out paperwork", points: 24, matches: ["paperwork"] },
      { text: "Get a tour of the office", points: 18, matches: ["tour", "office tour"] },
      { text: "Set up your computer", points: 16, matches: ["set up computer", "computer"] },
      { text: "Try to remember names", points: 14, matches: ["remember names", "names"] },
    ],
  },
  {
    prompt: "Name something people collect.",
    answers: [
      { text: "Stamps", points: 24, matches: ["stamps"] },
      { text: "Coins", points: 22, matches: ["coins"] },
      { text: "Sneakers", points: 18, matches: ["sneakers", "shoes"] },
      { text: "Baseball cards", points: 18, matches: ["baseball cards", "cards", "trading cards"] },
      { text: "Vinyl records", points: 18, matches: ["vinyl", "records", "vinyl records"] },
    ],
  },
  {
    prompt: "Name a reason your car wouldn't start.",
    answers: [
      { text: "Dead battery", points: 36, matches: ["dead battery", "battery"] },
      { text: "Out of gas", points: 22, matches: ["out of gas", "no gas"] },
      { text: "Bad alternator", points: 16, matches: ["alternator"] },
      { text: "Broken starter", points: 14, matches: ["starter"] },
      { text: "Frozen engine", points: 12, matches: ["frozen engine", "cold weather"] },
    ],
  },
  {
    prompt: "Name something you'd find in a first aid kit.",
    answers: [
      { text: "Band-aids", points: 32, matches: ["band-aids", "bandages"] },
      { text: "Gauze", points: 20, matches: ["gauze"] },
      { text: "Antiseptic/rubbing alcohol", points: 18, matches: ["antiseptic", "rubbing alcohol"] },
      { text: "Pain relievers", points: 16, matches: ["pain relievers", "aspirin", "ibuprofen"] },
      { text: "Tweezers", points: 14, matches: ["tweezers"] },
    ],
  },
  {
    prompt: "Name something people do to procrastinate.",
    answers: [
      { text: "Scroll social media", points: 30, matches: ["social media", "scroll phone"] },
      { text: "Clean the house", points: 22, matches: ["clean", "cleaning", "clean the house"] },
      { text: "Take a nap", points: 18, matches: ["nap", "sleep"] },
      { text: "Watch TV", points: 16, matches: ["watch tv", "tv", "netflix"] },
      { text: "Snack", points: 14, matches: ["snack", "eat"] },
    ],
  },
  {
    prompt: "Name a reason a flight would get delayed.",
    answers: [
      { text: "Bad weather", points: 34, matches: ["weather", "bad weather", "storm"] },
      { text: "Mechanical issues", points: 24, matches: ["mechanical issues", "mechanical problem"] },
      { text: "Air traffic", points: 16, matches: ["air traffic", "traffic control"] },
      { text: "Late crew", points: 14, matches: ["late crew", "crew"] },
      { text: "Overbooking", points: 12, matches: ["overbooking", "overbooked"] },
    ],
  },
  {
    prompt: "Name a New Year's resolution.",
    answers: [
      { text: "Lose weight/get fit", points: 32, matches: ["lose weight", "get fit", "exercise more"] },
      { text: "Save money", points: 22, matches: ["save money"] },
      { text: "Eat healthier", points: 18, matches: ["eat healthier", "diet"] },
      { text: "Quit a bad habit", points: 15, matches: ["quit smoking", "quit a bad habit"] },
      { text: "Travel more", points: 13, matches: ["travel more", "travel"] },
    ],
  },
  {
    prompt: "Name something you'd see at a campsite.",
    answers: [
      { text: "A tent", points: 30, matches: ["tent"] },
      { text: "A campfire", points: 26, matches: ["campfire", "fire"] },
      { text: "Marshmallows", points: 16, matches: ["marshmallows", "smores"] },
      { text: "Bugs", points: 15, matches: ["bugs", "mosquitos"] },
      { text: "A sleeping bag", points: 13, matches: ["sleeping bag"] },
    ],
  },
  {
    prompt: "Name something you'd never want to run out of.",
    answers: [
      { text: "Toilet paper", points: 30, matches: ["toilet paper"] },
      { text: "Money", points: 26, matches: ["money", "cash"] },
      { text: "Coffee", points: 18, matches: ["coffee"] },
      { text: "Gas", points: 14, matches: ["gas"] },
      { text: "Phone battery", points: 12, matches: ["phone battery", "battery"] },
    ],
  },
  {
    prompt: "Name something you'd do if you won the lottery.",
    answers: [
      { text: "Quit your job", points: 30, matches: ["quit job", "quit my job", "quit your job"] },
      { text: "Travel the world", points: 24, matches: ["travel the world", "travel"] },
      { text: "Buy a house", points: 18, matches: ["buy a house", "new house"] },
      { text: "Give money to family", points: 16, matches: ["give to family", "help family"] },
      { text: "Invest it", points: 12, matches: ["invest", "invest it"] },
    ],
  },
  {
    prompt: "Name something people do at a sleepover.",
    answers: [
      { text: "Watch movies", points: 28, matches: ["watch movies", "movies"] },
      { text: "Stay up late talking", points: 24, matches: ["stay up late", "talk"] },
      { text: "Eat junk food", points: 18, matches: ["junk food", "snacks", "eat snacks"] },
      { text: "Play games", points: 16, matches: ["play games", "games"] },
      { text: "Prank each other", points: 14, matches: ["pranks", "prank each other"] },
    ],
  },
  {
    prompt: "Name a reason someone would take a sick day when they aren't actually sick.",
    answers: [
      { text: "They're burned out/exhausted", points: 30, matches: ["burned out", "exhausted", "tired"] },
      { text: "A personal appointment", points: 22, matches: ["appointment", "personal appointment"] },
      { text: "Mental health", points: 20, matches: ["mental health", "mental health day"] },
      { text: "Hungover", points: 15, matches: ["hungover"] },
      { text: "Just needed a break", points: 13, matches: ["needed a break", "break"] },
    ],
  },
  {
    prompt: "Name something you'd bring camping.",
    answers: [
      { text: "A tent", points: 28, matches: ["tent"] },
      { text: "A flashlight", points: 22, matches: ["flashlight"] },
      { text: "Bug spray", points: 18, matches: ["bug spray"] },
      { text: "Food/snacks", points: 17, matches: ["food", "snacks"] },
      { text: "A sleeping bag", points: 15, matches: ["sleeping bag"] },
    ],
  },
  {
    prompt: "Name a job that requires wearing a hard hat.",
    answers: [
      { text: "Construction worker", points: 40, matches: ["construction worker", "construction"] },
      { text: "Electrician", points: 20, matches: ["electrician"] },
      { text: "Miner", points: 16, matches: ["miner"] },
      { text: "Engineer", points: 13, matches: ["engineer"] },
      { text: "Warehouse worker", points: 11, matches: ["warehouse worker", "warehouse"] },
    ],
  },
  {
    prompt: "Name a reason someone would be crying at a movie theater.",
    answers: [
      { text: "A sad scene", points: 32, matches: ["sad scene", "sad movie", "sad part"] },
      { text: "A happy ending", points: 22, matches: ["happy ending"] },
      { text: "It's really moving/emotional", points: 20, matches: ["emotional", "moving"] },
      { text: "A character died", points: 14, matches: ["character died", "death"] },
      { text: "Tears of laughter", points: 12, matches: ["laughing", "tears of laughter"] },
    ],
  },
  {
    prompt: "Name something you'd see at a farm.",
    answers: [
      { text: "Cows", points: 30, matches: ["cows", "cow"] },
      { text: "A barn", points: 22, matches: ["barn"] },
      { text: "Chickens", points: 18, matches: ["chickens", "chicken"] },
      { text: "Crops/fields", points: 16, matches: ["crops", "fields"] },
      { text: "A tractor", points: 14, matches: ["tractor"] },
    ],
  },
  {
    prompt: "Name something you'd say to calm someone down.",
    answers: [
      { text: "It's going to be okay", points: 30, matches: ["it's okay", "going to be okay", "it's going to be fine"] },
      { text: "Take a deep breath", points: 24, matches: ["breathe", "take a deep breath", "deep breath"] },
      { text: "Calm down", points: 18, matches: ["calm down"] },
      { text: "I'm here for you", points: 16, matches: ["i'm here for you", "here for you"] },
      { text: "Let's talk about it", points: 12, matches: ["let's talk", "talk about it"] },
    ],
  },
  {
    prompt: "Name something you might find lost in a couch cushion.",
    answers: [
      { text: "Loose change", points: 32, matches: ["change", "coins", "loose change"] },
      { text: "The remote control", points: 24, matches: ["remote", "remote control"] },
      { text: "Crumbs", points: 18, matches: ["crumbs", "food"] },
      { text: "A phone", points: 14, matches: ["phone"] },
      { text: "Pet hair", points: 12, matches: ["pet hair", "hair"] },
    ],
  },
  {
    prompt: "Name a reason you'd be late to your own wedding.",
    answers: [
      { text: "Traffic", points: 28, matches: ["traffic"] },
      { text: "Hair/makeup ran long", points: 24, matches: ["hair", "makeup", "getting ready"] },
      { text: "Wardrobe malfunction", points: 18, matches: ["wardrobe malfunction", "dress issue"] },
      { text: "Cold feet", points: 16, matches: ["cold feet", "nerves"] },
      { text: "Lost the rings", points: 14, matches: ["lost the rings", "rings"] },
    ],
  },
  {
    prompt: "Name something you'd find in a teenager's bedroom.",
    answers: [
      { text: "Dirty laundry", points: 28, matches: ["dirty laundry", "clothes on floor"] },
      { text: "A phone", points: 24, matches: ["phone"] },
      { text: "Posters", points: 18, matches: ["posters"] },
      { text: "Video games", points: 16, matches: ["video games", "games"] },
      { text: "Headphones", points: 14, matches: ["headphones"] },
    ],
  },
  {
    prompt: "Name something you'd do to impress a date.",
    answers: [
      { text: "Dress up nice", points: 30, matches: ["dress up", "dress nice", "nice clothes"] },
      { text: "Cook a nice meal", points: 22, matches: ["cook", "cook a meal", "make dinner"] },
      { text: "Bring flowers", points: 18, matches: ["flowers"] },
      { text: "Take them somewhere fancy", points: 16, matches: ["fancy restaurant", "nice restaurant"] },
      { text: "Compliment them", points: 14, matches: ["compliments", "compliment them"] },
    ],
  },
  {
    prompt: "Name something you'd see at an amusement park.",
    answers: [
      { text: "Roller coasters", points: 32, matches: ["roller coasters", "roller coaster"] },
      { text: "Cotton candy", points: 20, matches: ["cotton candy"] },
      { text: "Long lines", points: 18, matches: ["lines", "long lines"] },
      { text: "A ferris wheel", points: 16, matches: ["ferris wheel"] },
      { text: "Mascots/characters", points: 14, matches: ["mascots", "characters"] },
    ],
  },
  {
    prompt: "Name a reason to cancel plans last minute.",
    answers: [
      { text: "You're not feeling well", points: 30, matches: ["sick", "not feeling well"] },
      { text: "Something came up at work", points: 22, matches: ["work came up", "work"] },
      { text: "You're too tired", points: 18, matches: ["too tired", "tired"] },
      { text: "Bad weather", points: 16, matches: ["weather", "bad weather"] },
      { text: "You just don't feel like going", points: 14, matches: ["don't feel like it"] },
    ],
  },
  {
    prompt: "Name something a toddler does that drives parents crazy.",
    answers: [
      { text: "Throw tantrums", points: 32, matches: ["tantrums", "throw tantrums", "meltdowns"] },
      { text: "Refuse to eat", points: 22, matches: ["refuse to eat", "picky eating"] },
      { text: "Not sleep", points: 18, matches: ["not sleeping", "won't sleep"] },
      { text: "Ask 'why' constantly", points: 15, matches: ["asking why", "why questions"] },
      { text: "Touch everything", points: 13, matches: ["touch everything", "touching things"] },
    ],
  },
  {
    prompt: "Name something you'd see in a hospital room.",
    answers: [
      { text: "A hospital bed", points: 28, matches: ["hospital bed", "bed"] },
      { text: "Machines/monitors", points: 24, matches: ["machines", "monitors", "beeping machines"] },
      { text: "An IV", points: 18, matches: ["iv", "iv drip"] },
      { text: "Nurses/doctors", points: 16, matches: ["nurses", "doctors"] },
      { text: "Flowers/get well cards", points: 14, matches: ["flowers", "get well cards"] },
    ],
  },
  {
    prompt: "Name something you'd bring to a potluck.",
    answers: [
      { text: "A casserole", points: 24, matches: ["casserole"] },
      { text: "Dessert", points: 22, matches: ["dessert", "cake", "cookies"] },
      { text: "A salad", points: 20, matches: ["salad"] },
      { text: "Chips and dip", points: 18, matches: ["chips and dip", "chips", "dip"] },
      { text: "Drinks", points: 16, matches: ["drinks", "soda"] },
    ],
  },
  {
    prompt: "Name a reason someone would be kicked out of a movie theater.",
    answers: [
      { text: "Talking too loud", points: 30, matches: ["talking loud", "talking", "being loud"] },
      { text: "Phone use", points: 24, matches: ["phone", "using phone", "texting"] },
      { text: "Kicking the seat", points: 16, matches: ["kicking seat", "kicking the seat"] },
      { text: "Sneaking in food", points: 15, matches: ["sneaking in food", "outside food"] },
      { text: "Being drunk", points: 15, matches: ["drunk", "intoxicated"] },
    ],
  },
  {
    prompt: "Name something you'd see at a gym.",
    answers: [
      { text: "Treadmills", points: 28, matches: ["treadmills", "treadmill"] },
      { text: "Weights", points: 26, matches: ["weights", "dumbbells"] },
      { text: "Mirrors", points: 18, matches: ["mirrors"] },
      { text: "Sweaty people", points: 15, matches: ["sweaty people", "sweat"] },
      { text: "A personal trainer", points: 13, matches: ["personal trainer", "trainer"] },
    ],
  },
  {
    prompt: "Name a reason someone would take up a New Year's gym membership and quit by February.",
    answers: [
      { text: "They lost motivation", points: 32, matches: ["lost motivation", "no motivation"] },
      { text: "Too busy/no time", points: 22, matches: ["no time", "too busy"] },
      { text: "It's too expensive", points: 18, matches: ["expensive", "too expensive"] },
      { text: "They got sore/injured", points: 15, matches: ["sore", "injured"] },
      { text: "It's intimidating", points: 13, matches: ["intimidating"] },
    ],
  },
  {
    prompt: "Name something you'd see on a office desk.",
    answers: [
      { text: "A computer", points: 30, matches: ["computer", "laptop"] },
      { text: "A coffee mug", points: 22, matches: ["coffee mug", "mug", "coffee cup"] },
      { text: "Family photos", points: 18, matches: ["family photos", "photos"] },
      { text: "Sticky notes", points: 16, matches: ["sticky notes", "post-its"] },
      { text: "A stack of papers", points: 14, matches: ["papers", "paperwork"] },
    ],
  },
  {
    prompt: "Name something you might do to relieve stress.",
    answers: [
      { text: "Exercise", points: 26, matches: ["exercise", "workout"] },
      { text: "Listen to music", points: 22, matches: ["music", "listen to music"] },
      { text: "Meditate/breathe", points: 20, matches: ["meditate", "breathing", "meditation"] },
      { text: "Talk to a friend", points: 17, matches: ["talk to a friend", "vent to a friend"] },
      { text: "Take a bath", points: 15, matches: ["bath", "take a bath"] },
    ],
  },
  {
    prompt: "Name something people do with their pets.",
    answers: [
      { text: "Take them for walks", points: 30, matches: ["walk them", "take for walks", "walks"] },
      { text: "Play with them", points: 24, matches: ["play with them", "play"] },
      { text: "Take photos of them", points: 16, matches: ["take photos", "photos"] },
      { text: "Talk to them like a baby", points: 15, matches: ["baby talk", "talk to them"] },
      { text: "Dress them up", points: 15, matches: ["dress them up", "clothes for pets"] },
    ],
  },
  {
    prompt: "Name something you'd see in a college dorm room.",
    answers: [
      { text: "A bunk bed", points: 24, matches: ["bunk bed", "bed"] },
      { text: "A mini fridge", points: 24, matches: ["mini fridge", "fridge"] },
      { text: "Posters", points: 18, matches: ["posters"] },
      { text: "A laptop", points: 18, matches: ["laptop", "computer"] },
      { text: "Laundry piles", points: 16, matches: ["laundry", "dirty clothes"] },
    ],
  },
  {
    prompt: "Name a reason people avoid the dentist.",
    answers: [
      { text: "Fear of pain", points: 34, matches: ["pain", "fear of pain", "it hurts"] },
      { text: "The cost", points: 22, matches: ["cost", "expensive", "money"] },
      { text: "The drilling sound", points: 18, matches: ["drilling", "sound", "noise"] },
      { text: "Anxiety", points: 14, matches: ["anxiety", "nervous"] },
      { text: "Bad news about cavities", points: 12, matches: ["cavities", "bad news"] },
    ],
  },
  {
    prompt: "Name something you'd see at a music concert.",
    answers: [
      { text: "A crowd", points: 26, matches: ["crowd", "people"] },
      { text: "Loud speakers", points: 22, matches: ["speakers", "loud music"] },
      { text: "Stage lights", points: 20, matches: ["lights", "stage lights"] },
      { text: "Merch stands", points: 17, matches: ["merch", "merchandise"] },
      { text: "People filming on their phones", points: 15, matches: ["phones", "filming"] },
    ],
  },
  {
    prompt: "Name a popular type of exercise.",
    answers: [
      { text: "Running", points: 28, matches: ["running", "jogging"] },
      { text: "Weightlifting", points: 24, matches: ["weightlifting", "lifting weights"] },
      { text: "Yoga", points: 20, matches: ["yoga"] },
      { text: "Swimming", points: 15, matches: ["swimming"] },
      { text: "Cycling", points: 13, matches: ["cycling", "biking"] },
    ],
  },
  {
    prompt: "Name something you'd find in a garage.",
    answers: [
      { text: "Tools", points: 28, matches: ["tools"] },
      { text: "A car", points: 24, matches: ["car"] },
      { text: "Boxes of old stuff", points: 18, matches: ["boxes", "old stuff", "junk"] },
      { text: "A lawnmower", points: 16, matches: ["lawnmower"] },
      { text: "Bikes", points: 14, matches: ["bikes", "bicycles"] },
    ],
  },
  {
    prompt: "Name a reason someone would ghost you.",
    answers: [
      { text: "They lost interest", points: 32, matches: ["lost interest", "not interested"] },
      { text: "They're seeing someone else", points: 20, matches: ["seeing someone else", "another person"] },
      { text: "They're avoiding confrontation", points: 18, matches: ["avoiding confrontation", "afraid of confrontation"] },
      { text: "They got busy", points: 16, matches: ["got busy", "too busy"] },
      { text: "It wasn't that serious to begin with", points: 14, matches: ["not serious", "casual"] },
    ],
  },
  {
    prompt: "Name something you'd find at a construction site.",
    answers: [
      { text: "Hard hats", points: 28, matches: ["hard hats", "hard hat"] },
      { text: "Cranes", points: 22, matches: ["cranes", "crane"] },
      { text: "Bulldozers", points: 18, matches: ["bulldozers", "heavy machinery"] },
      { text: "Caution tape", points: 17, matches: ["caution tape", "tape"] },
      { text: "Blueprints", points: 15, matches: ["blueprints", "plans"] },
    ],
  },
  {
    prompt: "Name a reason you'd hire a babysitter.",
    answers: [
      { text: "A date night", points: 30, matches: ["date night", "date"] },
      { text: "Work commitments", points: 24, matches: ["work", "work commitments"] },
      { text: "A night out with friends", points: 18, matches: ["night out", "friends"] },
      { text: "An emergency", points: 15, matches: ["emergency"] },
      { text: "You just need a break", points: 13, matches: ["need a break", "break"] },
    ],
  },
  {
    prompt: "Name something you'd see at a farmers' Halloween party.",
    answers: [
      { text: "Costumes", points: 34, matches: ["costumes", "costume"] },
      { text: "Candy", points: 26, matches: ["candy"] },
      { text: "A pumpkin/jack-o-lantern", points: 18, matches: ["pumpkin", "jack-o-lantern"] },
      { text: "Spooky decorations", points: 12, matches: ["decorations", "spooky decorations"] },
      { text: "Scary music", points: 10, matches: ["scary music", "music"] },
    ],
  },
  {
    prompt: "Name a reason people avoid answering their phone.",
    answers: [
      { text: "It's an unknown number", points: 30, matches: ["unknown number", "unknown caller"] },
      { text: "They're avoiding someone", points: 22, matches: ["avoiding someone", "don't want to talk"] },
      { text: "They're busy", points: 20, matches: ["busy"] },
      { text: "They think it's a scam call", points: 16, matches: ["scam", "spam call", "telemarketer"] },
      { text: "Their phone is on silent", points: 12, matches: ["phone on silent", "silent mode"] },
    ],
  },
  {
    prompt: "Name something you'd see on a refrigerator.",
    answers: [
      { text: "Magnets", points: 28, matches: ["magnets", "magnet"] },
      { text: "Kids' artwork", points: 24, matches: ["kids artwork", "drawings", "artwork"] },
      { text: "A calendar", points: 18, matches: ["calendar"] },
      { text: "Photos", points: 16, matches: ["photos", "pictures"] },
      { text: "A grocery list", points: 14, matches: ["grocery list", "shopping list"] },
    ],
  },
  {
    prompt: "Name a reason someone would join a gym class.",
    answers: [
      { text: "To lose weight", points: 30, matches: ["lose weight"] },
      { text: "For motivation/accountability", points: 22, matches: ["motivation", "accountability"] },
      { text: "To meet people", points: 18, matches: ["meet people", "socialize"] },
      { text: "To learn proper form", points: 16, matches: ["proper form", "learn technique"] },
      { text: "For fun", points: 14, matches: ["fun", "enjoyment"] },
    ],
  },
  {
    prompt: "Name something you'd bring to a job you dislike but need money for.",
    answers: [
      { text: "A fake smile", points: 26, matches: ["fake smile", "smile"] },
      { text: "Coffee", points: 24, matches: ["coffee"] },
      { text: "Patience", points: 20, matches: ["patience"] },
      { text: "Headphones", points: 16, matches: ["headphones"] },
      { text: "A resume, just in case", points: 14, matches: ["resume"] },
    ],
  },
  {
    prompt: "Name something you'd see in a kid's toy box.",
    answers: [
      { text: "Action figures", points: 24, matches: ["action figures", "figures"] },
      { text: "Building blocks/Legos", points: 24, matches: ["legos", "blocks", "building blocks"] },
      { text: "Stuffed animals", points: 20, matches: ["stuffed animals", "teddy bears"] },
      { text: "A ball", points: 16, matches: ["ball"] },
      { text: "Puzzles", points: 16, matches: ["puzzles", "puzzle"] },
    ],
  },
  {
    prompt: "Name a reason you'd stay home from a party.",
    answers: [
      { text: "You're introverted/tired", points: 28, matches: ["introverted", "tired", "not feeling social"] },
      { text: "You're not feeling well", points: 24, matches: ["sick", "not feeling well"] },
      { text: "No one you know is going", points: 18, matches: ["don't know anyone", "no one i know"] },
      { text: "You have other plans", points: 16, matches: ["other plans", "busy"] },
      { text: "It's too far away", points: 14, matches: ["too far", "far away"] },
    ],
  },
];

const DEFAULT_ROUNDS = 6;

// Questions already asked, tracked across games for as long as this server
// process stays up, so replaying the game doesn't repeat the same prompts.
const usedPrompts = new Set<string>();

let chatSeq = 0;

export type FeudPhase = "faceoff" | "controlling" | "stealing" | "roundEnd" | "finished";

interface FeudAnswer {
  text: string;
  points: number;
  matches: string[];
  revealed: boolean;
}

interface FeudTeam {
  id: TeamId;
  name: string;
  memberIds: PlayerId[];
  score: number;
}

export interface FeudState {
  hostId: PlayerId;
  teams: Record<TeamId, FeudTeam>;
  roundIndex: number;
  totalRounds: number;
  questionOrder: number[];
  prompt: string;
  answers: FeudAnswer[];
  phase: FeudPhase;
  // Face-off is now a buzz-in: whoever's captain buzzes first gets first crack
  // at the answer; if they miss, the other captain gets a turn.
  faceoffBuzzedTeam: TeamId | null; // whose captain currently has the floor
  faceoffFirstTeam: TeamId | null; // who buzzed in first this face-off (tiebreak if both miss)
  faceoffAttempted: TeamId[]; // teams that already used their one face-off guess
  controllingTeam: TeamId | null;
  controllingIndex: number; // whose turn (index into that team's memberIds) to guess next
  stealingTeam: TeamId | null;
  strikes: number;
  pot: number;
  roundLog: string[];
  lastRoundResult: { winningTeam: TeamId | null; pot: number; reason: string } | null;
  // Whoever currently has to answer/guess is racing this deadline — 7s for a
  // face-off buzz-in answer, 25s for a controlling/stealing guess. `null`
  // when nobody's currently on the clock (e.g. waiting for a buzz).
  guessDeadline: number | null;
  teamChats: Record<TeamId, TeamChatMessage[]>;
}

interface TeamChatMessage {
  id: string;
  playerId: PlayerId;
  text: string;
  at: number;
}

export interface FeudView {
  hostId: PlayerId;
  yourTeam: TeamId;
  captainA: PlayerId;
  captainB: PlayerId;
  areYouCaptain: boolean;
  teams: { id: TeamId; name: string; memberIds: PlayerId[]; score: number }[];
  roundIndex: number;
  totalRounds: number;
  prompt: string;
  answers: { index: number; text: string | null; points: number | null; revealed: boolean }[];
  phase: FeudPhase;
  faceoffBuzzedTeam: TeamId | null;
  faceoffAttempted: TeamId[];
  currentGuesserId: PlayerId | null; // whose turn it is to guess during controlling/stealing
  controllingTeam: TeamId | null;
  stealingTeam: TeamId | null;
  strikes: number;
  pot: number;
  roundLog: string[];
  lastRoundResult: FeudState["lastRoundResult"];
  guessDeadline: number | null;
  teamChat: TeamChatMessage[]; // your team's chat only — the other team's is never sent to you
}

export type FeudAction =
  | { type: "buzz" }
  | { type: "faceoffAnswer"; text: string }
  | { type: "guess"; text: string }
  | { type: "steal"; text: string }
  | { type: "advance" }
  | { type: "timeUp" }
  | { type: "teamChat"; text: string };

const FACEOFF_ANSWER_MS = 7_000;
const GUESS_MS = 25_000;

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/^(a|an|the)\s+/, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! : 1 + Math.min(prev[j - 1]!, prev[j]!, row[j - 1]!);
    }
    prev = row;
  }
  return prev[b.length]!;
}

// Accepts near-misses (typos, near-homophones like "hangover" vs "hungover")
// instead of requiring an exact or substring match — the threshold scales
// with word length so short words still need to be close to exact.
function fuzzyEquals(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen < 4) return false;
  const threshold = maxLen <= 6 ? 1 : maxLen <= 10 ? 2 : 3;
  return levenshtein(a, b) <= threshold;
}

function buildAnswers(def: FeudQuestionDef): FeudAnswer[] {
  return def.answers.map((a) => ({ text: a.text, points: a.points, matches: a.matches, revealed: false }));
}

function findMatch(text: string, answers: FeudAnswer[]): number | null {
  const guess = normalize(text);
  if (!guess) return null;
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i]!;
    if (a.revealed) continue;
    for (const variant of a.matches) {
      const v = normalize(variant);
      if (guess === v) return i;
      if (guess.length >= 4 && v.length >= 4 && (guess.includes(v) || v.includes(guess))) return i;
      if (fuzzyEquals(guess, v)) return i;
    }
  }
  return null;
}

function captainOf(team: FeudTeam, roundIndex: number): PlayerId {
  return team.memberIds[roundIndex % team.memberIds.length]!;
}

function startRound(state: FeudState, roundIndex: number): FeudState {
  const def = QUESTION_BANK[state.questionOrder[roundIndex]!]!;
  return {
    ...state,
    roundIndex,
    prompt: def.prompt,
    answers: buildAnswers(def),
    phase: "faceoff",
    faceoffBuzzedTeam: null,
    faceoffFirstTeam: null,
    faceoffAttempted: [],
    controllingTeam: null,
    controllingIndex: 0,
    stealingTeam: null,
    strikes: 0,
    pot: 0,
    roundLog: [`Round ${roundIndex + 1}: ${def.prompt}`],
    lastRoundResult: null,
    guessDeadline: null, // nobody's on the clock until a captain buzzes in
  };
}

// Reveals every remaining hidden answer (so the board shows the full survey
// once a round is over) and banks the pot for the winning team, if any.
function endRound(state: FeudState, winningTeam: TeamId | null, reason: string): FeudState {
  const teams = { ...state.teams };
  if (winningTeam) {
    teams[winningTeam] = { ...teams[winningTeam], score: teams[winningTeam].score + state.pot };
  }
  const answers = state.answers.map((a) => (a.revealed ? a : { ...a, revealed: true }));
  return {
    ...state,
    teams,
    answers,
    phase: "roundEnd",
    lastRoundResult: { winningTeam, pot: state.pot, reason },
    roundLog: [...state.roundLog, reason],
    guessDeadline: null,
  };
}

export const familyFeud: GameDefinition<FeudState, FeudView, FeudAction> = {
  meta: {
    id: "family-feud",
    name: "Family Feud",
    tagline: "Two teams, survey says! Face off, control the board, and steal points.",
    category: "party",
    minPlayers: 4,
    maxPlayers: 12,
    options: [{ key: "rounds", label: "Rounds", type: "number", min: 1, max: QUESTION_BANK.length, default: DEFAULT_ROUNDS }],
  },
  createInitialState(players: PlayerInfo[], options: GameOptions) {
    const host = players.find((p) => p.isHost) ?? players[0]!;
    const teamA: FeudTeam = { id: "A", name: "Team Red", memberIds: [], score: 0 };
    const teamB: FeudTeam = { id: "B", name: "Team Blue", memberIds: [], score: 0 };
    const assignment = assignTeams(players, options, ["A", "B"] as const);
    for (const p of players) (assignment[p.id] === "A" ? teamA : teamB).memberIds.push(p.id);
    const roundCount = Math.min(Number(options.rounds) || DEFAULT_ROUNDS, QUESTION_BANK.length);
    const allIndices = QUESTION_BANK.map((_, i) => i);
    const freshIndices = allIndices.filter((i) => !usedPrompts.has(QUESTION_BANK[i]!.prompt));
    const pool = freshIndices.length >= roundCount ? freshIndices : allIndices; // reuse once the fresh pool runs out
    const questionOrder = shuffle(pool).slice(0, roundCount);
    for (const i of questionOrder) usedPrompts.add(QUESTION_BANK[i]!.prompt);

    const base: FeudState = {
      hostId: host.id,
      teams: { A: teamA, B: teamB },
      roundIndex: 0,
      totalRounds: questionOrder.length,
      questionOrder,
      prompt: "",
      answers: [],
      phase: "faceoff",
      faceoffBuzzedTeam: null,
      faceoffFirstTeam: null,
      faceoffAttempted: [],
      controllingTeam: null,
      controllingIndex: 0,
      stealingTeam: null,
      strikes: 0,
      pot: 0,
      roundLog: [],
      lastRoundResult: null,
      guessDeadline: null,
      teamChats: { A: [], B: [] },
    };
    return startRound(base, 0);
  },
  applyAction(state, playerId, action) {
    if (state.phase === "finished") throw new GameActionError("Game is already over.");

    if (action.type === "teamChat") {
      const team: TeamId | null = state.teams.A.memberIds.includes(playerId) ? "A" : state.teams.B.memberIds.includes(playerId) ? "B" : null;
      if (!team) throw new GameActionError("You're not on a team in this game.");
      const text = action.text.trim().slice(0, 200);
      if (!text) throw new GameActionError("Message can't be empty.");
      chatSeq += 1;
      const message: TeamChatMessage = { id: `tc${chatSeq}`, playerId, text, at: Date.now() };
      const teamChats = { ...state.teamChats, [team]: [...state.teamChats[team], message].slice(-50) };
      return { ...state, teamChats };
    }

    const yourTeam: TeamId | null = state.teams.A.memberIds.includes(playerId) ? "A" : state.teams.B.memberIds.includes(playerId) ? "B" : null;
    if (!yourTeam) throw new GameActionError("You're not on a team in this game.");

    if (action.type === "buzz") {
      if (state.phase !== "faceoff") throw new GameActionError("No face-off happening right now.");
      if (state.faceoffBuzzedTeam) throw new GameActionError("Someone already buzzed in.");
      const captain = captainOf(state.teams[yourTeam], state.roundIndex);
      if (playerId !== captain) throw new GameActionError("Only your team's face-off player can buzz in.");
      if (state.faceoffAttempted.includes(yourTeam)) throw new GameActionError("Your team already had a turn.");
      return {
        ...state,
        faceoffBuzzedTeam: yourTeam,
        faceoffFirstTeam: state.faceoffFirstTeam ?? yourTeam,
        guessDeadline: Date.now() + FACEOFF_ANSWER_MS,
        roundLog: [...state.roundLog, `${state.teams[yourTeam].name} buzzed in first!`],
      };
    }

    if (action.type === "faceoffAnswer" || (action.type === "timeUp" && state.phase === "faceoff" && state.faceoffBuzzedTeam)) {
      if (state.phase !== "faceoff") throw new GameActionError("No face-off happening right now.");
      const actingTeam = state.faceoffBuzzedTeam;
      if (!actingTeam) throw new GameActionError("Buzz in first.");
      const isTimeUp = action.type === "timeUp";
      if (!isTimeUp) {
        if (actingTeam !== yourTeam) throw new GameActionError("Buzz in first.");
        const captain = captainOf(state.teams[yourTeam], state.roundIndex);
        if (playerId !== captain) throw new GameActionError("Only your team's face-off player can answer.");
      }
      const text = isTimeUp ? "" : (action as { text: string }).text.trim().slice(0, 60);
      if (!isTimeUp && !text) throw new GameActionError("Answer can't be empty.");

      const attempted = [...state.faceoffAttempted, actingTeam];
      const idx = findMatch(text, state.answers);
      const log = isTimeUp
        ? [...state.roundLog, `${state.teams[actingTeam].name} ran out of time!`]
        : [...state.roundLog, `${state.teams[actingTeam].name} answered "${text}".`];

      if (idx !== null) {
        const answers = state.answers.slice();
        answers[idx] = { ...answers[idx]!, revealed: true };
        return {
          ...state,
          answers,
          faceoffAttempted: attempted,
          phase: "controlling",
          controllingTeam: actingTeam,
          controllingIndex: 0,
          pot: answers[idx]!.points,
          guessDeadline: Date.now() + GUESS_MS,
          roundLog: [...log, `On the board! ${state.teams[actingTeam].name} takes control.`],
        };
      }

      const otherTeam: TeamId = actingTeam === "A" ? "B" : "A";
      if (!attempted.includes(otherTeam)) {
        // Not on the board — pass the floor to the other captain.
        return {
          ...state,
          faceoffBuzzedTeam: otherTeam,
          faceoffAttempted: attempted,
          guessDeadline: Date.now() + FACEOFF_ANSWER_MS,
          roundLog: [...log, `Not on the board. ${state.teams[otherTeam].name}'s turn to answer.`],
        };
      }

      // Both teams missed — whoever buzzed in first gets control with an empty pot.
      const winner = state.faceoffFirstTeam ?? actingTeam;
      return {
        ...state,
        faceoffAttempted: attempted,
        phase: "controlling",
        controllingTeam: winner,
        controllingIndex: 0,
        pot: 0,
        guessDeadline: Date.now() + GUESS_MS,
        roundLog: [...log, `Both teams missed. ${state.teams[winner].name} takes control.`],
      };
    }

    if (action.type === "guess" || (action.type === "timeUp" && state.phase === "controlling")) {
      if (state.phase !== "controlling") throw new GameActionError("Your team isn't in control right now.");
      const team = state.teams[state.controllingTeam!];
      const expectedGuesser = team.memberIds[state.controllingIndex % team.memberIds.length]!;
      const isTimeUp = action.type === "timeUp";
      if (!isTimeUp) {
        if (yourTeam !== state.controllingTeam) throw new GameActionError("It's the other team's turn to guess.");
        if (playerId !== expectedGuesser) throw new GameActionError("It's a teammate's turn to guess.");
      }
      const text = isTimeUp ? "" : (action as { text: string }).text.trim().slice(0, 60);
      if (!isTimeUp && !text) throw new GameActionError("Guess can't be empty.");
      const idx = findMatch(text, state.answers);
      const controllingIndex = state.controllingIndex + 1;
      const actingTeam = state.controllingTeam!;

      if (idx === null) {
        const strikes = state.strikes + 1;
        const log = isTimeUp
          ? [...state.roundLog, `${state.teams[actingTeam].name} ran out of time — strike ${strikes}!`]
          : [...state.roundLog, `${state.teams[actingTeam].name} guessed "${text}" — strike ${strikes}!`];
        if (strikes >= 3) {
          const other: TeamId = actingTeam === "A" ? "B" : "A";
          return { ...state, strikes, controllingIndex, phase: "stealing", stealingTeam: other, guessDeadline: Date.now() + GUESS_MS, roundLog: log };
        }
        return { ...state, strikes, controllingIndex, guessDeadline: Date.now() + GUESS_MS, roundLog: log };
      }

      const answers = state.answers.slice();
      answers[idx] = { ...answers[idx]!, revealed: true };
      const pot = state.pot + answers[idx]!.points;
      const log = [...state.roundLog, `${state.teams[actingTeam].name} revealed "${answers[idx]!.text}" (${answers[idx]!.points} pts).`];
      const boardCleared = answers.every((a) => a.revealed);
      const next = { ...state, answers, pot, controllingIndex, guessDeadline: Date.now() + GUESS_MS, roundLog: log };
      if (boardCleared) return endRound(next, actingTeam, `${state.teams[actingTeam].name} cleared the board and banks ${pot} points!`);
      return next;
    }

    if (action.type === "steal" || (action.type === "timeUp" && state.phase === "stealing")) {
      if (state.phase !== "stealing") throw new GameActionError("Not a steal opportunity right now.");
      const actingTeam = state.stealingTeam!;
      const isTimeUp = action.type === "timeUp";
      if (!isTimeUp && yourTeam !== state.stealingTeam) throw new GameActionError("Only the stealing team can guess.");
      const text = isTimeUp ? "" : (action as { text: string }).text.trim().slice(0, 60);
      if (!isTimeUp && !text) throw new GameActionError("Guess can't be empty.");
      const idx = findMatch(text, state.answers);
      if (idx !== null) {
        const answers = state.answers.slice();
        answers[idx] = { ...answers[idx]!, revealed: true };
        return endRound(
          { ...state, answers },
          actingTeam,
          `${state.teams[actingTeam].name} steals with "${answers[idx]!.text}" and takes ${state.pot} points!`
        );
      }
      const controllingTeam = state.controllingTeam!;
      const reason = isTimeUp
        ? `${state.teams[actingTeam].name} ran out of time. ${state.teams[controllingTeam].name} keeps ${state.pot} points.`
        : `${state.teams[actingTeam].name}'s steal attempt failed. ${state.teams[controllingTeam].name} keeps ${state.pot} points.`;
      return endRound(state, controllingTeam, reason);
    }

    if (action.type === "timeUp") {
      // No active timer to expire (e.g. still waiting for a buzz) — a no-op
      // rather than an error, since the client's timer effect can't always
      // perfectly know when a deadline it fired for is already stale.
      return state;
    }

    if (action.type === "advance") {
      if (playerId !== state.hostId) throw new GameActionError("Only the host can advance the game.");
      if (state.phase !== "roundEnd") throw new GameActionError("Nothing to advance.");
      const nextIndex = state.roundIndex + 1;
      if (nextIndex >= state.totalRounds) return { ...state, phase: "finished" };
      return startRound(state, nextIndex);
    }

    throw new GameActionError("Unknown action.");
  },
  getPlayerView(state, playerId) {
    const yourTeam: TeamId = state.teams.A.memberIds.includes(playerId) ? "A" : "B";
    const captainA = captainOf(state.teams.A, state.roundIndex);
    const captainB = captainOf(state.teams.B, state.roundIndex);
    const areYouCaptain = playerId === captainA || playerId === captainB;
    let currentGuesserId: PlayerId | null = null;
    if (state.phase === "controlling" && state.controllingTeam) {
      const team = state.teams[state.controllingTeam];
      currentGuesserId = team.memberIds[state.controllingIndex % team.memberIds.length]!;
    }
    return {
      hostId: state.hostId,
      yourTeam,
      captainA,
      captainB,
      areYouCaptain,
      teams: (["A", "B"] as TeamId[]).map((id) => ({ id, name: state.teams[id].name, memberIds: state.teams[id].memberIds, score: state.teams[id].score })),
      roundIndex: state.roundIndex,
      totalRounds: state.totalRounds,
      prompt: state.prompt,
      answers: state.answers.map((a, index) => ({
        index,
        text: a.revealed ? a.text : null,
        points: a.revealed ? a.points : null,
        revealed: a.revealed,
      })),
      phase: state.phase,
      faceoffBuzzedTeam: state.faceoffBuzzedTeam,
      faceoffAttempted: state.faceoffAttempted,
      currentGuesserId,
      controllingTeam: state.controllingTeam,
      stealingTeam: state.stealingTeam,
      strikes: state.strikes,
      pot: state.pot,
      roundLog: state.roundLog.slice(-6),
      lastRoundResult: state.lastRoundResult,
      guessDeadline: state.guessDeadline,
      teamChat: state.teamChats[yourTeam],
    };
  },
  isGameOver(state) {
    return state.phase === "finished";
  },
  getWinnerIds(state) {
    if (state.phase !== "finished") return [];
    if (state.teams.A.score === state.teams.B.score) return [...state.teams.A.memberIds, ...state.teams.B.memberIds];
    const winner = state.teams.A.score > state.teams.B.score ? state.teams.A : state.teams.B;
    return winner.memberIds;
  },
  getRanking(state) {
    // Team-based: the higher-scoring team's members all rank ahead of the
    // other team's, in original member order within each team.
    if (state.teams.A.score === state.teams.B.score) return [...state.teams.A.memberIds, ...state.teams.B.memberIds];
    const winner = state.teams.A.score > state.teams.B.score ? state.teams.A : state.teams.B;
    const loser = winner.id === "A" ? state.teams.B : state.teams.A;
    return [...winner.memberIds, ...loser.memberIds];
  },
};
