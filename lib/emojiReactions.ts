// Single source of truth for which emojis the quick-reaction picker offers
// — imported by both the client (EmoteBar, to render the picker) and the
// server (server/index.ts, to validate incoming "room:emote" events). The
// server used to keep its own separate hardcoded whitelist; when the
// picker's options were expanded, only the client-side list got updated,
// so every new emoji got silently dropped by the server's stale allowlist
// (no error either — it just returns early). One shared list means adding
// an emoji here is the only place that needs to change.
export const EMOTE_OPTIONS = [
  "👍", "❤️", "😂", "🎉", "👏", "😮", "🔥", "👎",
  "😍", "🥳", "💀", "🤯", "👀", "💯", "🙌", "😢",
  "🤔", "😱", "✨", "🍻", "😴", "🤡", "🫡", "🤝",
] as const;
