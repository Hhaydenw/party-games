"use client";

// Every countdown in this app (round timers, spin animations, etc.) works
// by comparing a server-issued deadline (an absolute epoch-ms timestamp)
// against "now". Every one of those was calling `Date.now()` directly —
// which is the *client's own* system clock, never synchronized against the
// server's. That's fine if they happen to agree, but real devices commonly
// drift by anywhere from a couple seconds to several minutes (especially
// phones with automatic-time-zone-but-not-time quirks, or just a stale
// clock), and every player in a room could have a different drift. That's
// almost certainly why timers looked "off for almost everyone" — each
// client was quietly comparing a shared server deadline against its own,
// unsynchronized idea of "now".
//
// This module tracks a single clock offset (serverTime - clientTime),
// estimated via a small round-trip-time ping/pong exercise run from
// socketClient on connect (see requestClockSync below), and exposes
// serverNow() as a drop-in replacement for Date.now() in every timer
// calculation. It's deliberately a plain module-level value, not React
// state — timer ticks read it inside setInterval callbacks, not JSX, so
// there's nothing to subscribe to re-renders for.

let offsetMs = 0;

export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function getClockOffsetMs(): number {
  return offsetMs;
}

// Takes several ping samples (a plain socket.io ack round-trip) and keeps
// the offset implied by the samples with the lowest round-trip time —
// under load or on a flaky connection, a single sample's RTT can be
// dominated by one-way jitter that makes the naive "split the RTT in half"
// assumption inaccurate, so keeping the fastest few samples out of several
// gives a much steadier estimate than a single ping would.
export async function syncClockOffset(
  ping: () => Promise<number>, // returns the server's timestamp for one round trip
  samples = 5
): Promise<void> {
  const results: { offset: number; rtt: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    let serverTime: number;
    try {
      serverTime = await ping();
    } catch {
      continue;
    }
    const t1 = Date.now();
    const rtt = t1 - t0;
    // Assumes the request and response legs took roughly equal time —
    // the standard NTP-style approximation. Estimates what the server's
    // clock read *at t1* (when this client received the reply).
    const offset = serverTime + rtt / 2 - t1;
    results.push({ offset, rtt });
  }
  if (results.length === 0) return;
  results.sort((a, b) => a.rtt - b.rtt);
  const keep = results.slice(0, Math.max(1, Math.ceil(results.length / 2)));
  offsetMs = keep.reduce((sum, r) => sum + r.offset, 0) / keep.length;
}
