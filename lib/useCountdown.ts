"use client";

import { useEffect, useRef, useState } from "react";
import { serverNow } from "@/lib/serverClock";

// A countdown tied to a server-issued deadline (an absolute epoch-ms
// timestamp) — every round timer in this app now goes through this one
// hook rather than each game view carrying its own copy of this logic,
// which had drifted into subtly inconsistent variations across ~11 files.
// Two real bugs this fixes at once:
//
// 1. Ticks against the clock-synced serverNow() (see lib/serverClock.ts)
//    instead of each client's own unsynced Date.now() — a client whose
//    system clock is off (common on phones) used to see a countdown that
//    disagreed with everyone else's, sometimes badly.
// 2. `onExpire` used to only ever be wired up to fire on the host's
//    client. If the host's tab gets backgrounded — trivially easy at a
//    party, someone sets their phone down — mobile browsers throttle
//    `setInterval` in background tabs, sometimes by many seconds, so the
//    round could hang well past its displayed deadline for everyone else
//    while waiting on a tick that might not run for a while. Every client
//    still ticks locally, but only the "primary" one (normally the host)
//    fires immediately at zero; everyone else fires it too, just after an
//    extra grace delay, as a fallback. The server safely no-ops a
//    redundant timeUp once the phase's already moved past it, so there's
//    no harm in more than one client racing to send it.
const FALLBACK_GRACE_MS = 2000;
const TICK_MS = 250;

export function useCountdown(deadline: number | null, isPrimary: boolean, onExpire: () => void): number | null {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const firedRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    firedRef.current = false;
    if (!deadline) {
      setRemainingMs(null);
      return;
    }
    const tick = () => {
      const now = serverNow();
      const remaining = Math.max(0, deadline - now);
      setRemainingMs(remaining);
      if (remaining === 0 && !firedRef.current) {
        const overdueBy = now - deadline;
        if (isPrimary || overdueBy >= FALLBACK_GRACE_MS) {
          firedRef.current = true;
          onExpireRef.current();
        }
      }
    };
    tick();
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, [deadline, isPrimary]);

  return remainingMs;
}
