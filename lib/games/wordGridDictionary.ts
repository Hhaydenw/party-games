import { WORDLIST_TEXT } from "@/lib/games/data/wordlistData";

// Split into its own module (rather than inlined in wordGrid.ts) so it can
// be dynamically imported — see wordGrid.ts's isValidWord for why that
// matters for bundle size.
let wordSet: Set<string> | null = null;
export function getWordSet(): Set<string> {
  if (!wordSet) wordSet = new Set(WORDLIST_TEXT.split("\n").filter(Boolean));
  return wordSet;
}
