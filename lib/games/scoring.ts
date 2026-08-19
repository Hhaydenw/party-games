// Shared point curve for "everyone races to answer/guess the same prompt"
// games (Doodle Guess, Name That Tune, Trivia): whoever gets there first
// earns the most, with a steep drop-off rather than everyone-who-eventually-
// got-it-right earning roughly the same amount. Only the top 3 finishers
// score anything — same shape as a lot of real party games' bonus rounds.
export function racePoints(position: number): number {
  if (position === 0) return 5;
  if (position === 1) return 3;
  if (position === 2) return 1;
  return 0;
}
