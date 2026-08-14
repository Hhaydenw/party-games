"use client";

import { useEffect, useRef, useState } from "react";
import type { Viewer as ViewerType } from "mapillary-js";
import "mapillary-js/dist/mapillary.css";
import { CameraState, StreetSnapAction, StreetSnapView as ViewType } from "@/lib/games/streetSnap";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";

// This is the one game in the app whose core interaction (a live WebGL
// street-imagery viewer) can't be exercised by this project's usual
// automated test suite — everything else here is verified end-to-end with
// real socket/unit tests, but there's no headless way to confirm mapillary-js
// actually renders correctly against live imagery without a real browser and
// a real MAPILLARY_TOKEN. The integration below is written against
// mapillary-js's documented/shipped TypeScript API, but treat it as needing
// a first real run-through before trusting it blind.
//
// One real issue this surfaced: MapillaryJS measures its container's size
// at construction time to size its WebGL viewport, but React/flexbox/
// aspect-ratio layouts don't always have their final size committed to the
// DOM on the exact tick the viewer is constructed — the viewer can end up
// rendering into a 0x0 (or stale) viewport, which shows as a solid black
// box even though data loaded successfully. `attachResizeObserver` below
// forces a re-measure on the next animation frame and on any subsequent
// container resize, which is the fix.
function attachResizeObserver(container: HTMLElement, viewer: ViewerType): () => void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        viewer.resize();
      } catch {
        // ignore — viewer may already be torn down
      }
    });
  });
  const observer = new ResizeObserver(() => {
    try {
      viewer.resize();
    } catch {
      // ignore
    }
  });
  observer.observe(container);
  return () => observer.disconnect();
}

export default function StreetSnapView({
  view,
  onAction,
  meId,
  players,
}: {
  view: ViewType;
  onAction: (action: StreetSnapAction) => void;
  meId: string;
  players: PlayerInfo[];
}) {
  const isHost = meId === view.hostId;
  const nameFor = (id: string) => (id === meId ? "You" : players.find((p) => p.id === id)?.name ?? "…");

  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const firedTimeUp = useRef(false);
  const deadline = view.phase === "exploring" ? view.exploreEndsAt : view.phase === "voting" ? view.voteEndsAt : null;
  useEffect(() => {
    firedTimeUp.current = false;
    if (!deadline) {
      setRemainingMs(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, deadline - Date.now());
      setRemainingMs(remaining);
      if (remaining === 0 && isHost && !firedTimeUp.current) {
        firedTimeUp.current = true;
        onAction({ type: "timeUp" }); // safety net in case someone's client didn't auto-submit (e.g. disconnected)
      }
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [deadline, isHost, onAction]);

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Round {view.roundIndex + 1} of {view.totalRounds}
        </p>
        <p className="mt-1 text-lg font-bold text-gold">
          📍 {view.city.name}, {view.city.country}
        </p>
        {remainingMs !== null && (
          <p className="mt-1 font-mono text-2xl font-black tabular-nums text-slate-200">
            {Math.floor(remainingMs / 1000 / 60)}:{String(Math.ceil((remainingMs / 1000) % 60)).padStart(2, "0")}
          </p>
        )}
      </div>

      {view.phase === "exploring" && <ExploringPanel view={view} onAction={onAction} />}
      {view.phase === "voting" && <VotingPanel view={view} onAction={onAction} meId={meId} nameFor={nameFor} />}

      {(view.phase === "roundEnd" || view.phase === "finished") && (
        <div className="flex w-full max-w-lg flex-col items-center gap-2">
          <p className="text-sm font-semibold text-slate-300">Round results</p>
          {(view.photos ?? [])
            .slice()
            .sort((a, b) => b.votes - a.votes)
            .map((p) => (
              <div key={p.playerId} className="flex w-full items-center justify-between rounded-xl bg-white/5 px-4 py-2 text-sm">
                <span>{nameFor(p.playerId)}</span>
                <span className="text-gold">
                  {p.votes} vote{p.votes === 1 ? "" : "s"}
                </span>
              </div>
            ))}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3 text-sm">
        {[...view.scores]
          .sort((a, b) => b.score - a.score)
          .map((s) => (
            <span key={s.playerId} className="rounded-xl bg-white/5 px-3 py-1.5">
              {nameFor(s.playerId)}: {s.score}
              {s.roundGain > 0 && <span className="ml-1 text-emerald-400">+{s.roundGain}</span>}
            </span>
          ))}
      </div>

      {view.phase === "roundEnd" && isHost && (
        <button className="btn-primary" onClick={() => onAction({ type: "advance" })}>
          {view.roundIndex + 1 >= view.totalRounds ? "See final results" : "Next city"}
        </button>
      )}
      {view.phase === "roundEnd" && !isHost && <p className="text-sm text-slate-400">Waiting for the host…</p>}

      {view.log.length > 0 && (
        <div className="w-full max-w-xl rounded-xl bg-black/20 p-3 text-xs text-slate-400">
          {[...view.log].reverse().slice(0, 3).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function ExploringPanel({ view, onAction }: { view: ViewType; onAction: (action: StreetSnapAction) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ViewerType | null>(null);
  const currentImageIdRef = useRef<string>(view.startImageId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const submittedRef = useRef(view.yourPhotoSubmitted);
  submittedRef.current = view.yourPhotoSubmitted;

  useEffect(() => {
    let cancelled = false;
    let detachResize: (() => void) | null = null;
    setReady(false);
    setLoadError(null);
    currentImageIdRef.current = view.startImageId;

    // If nothing has loaded after a while, surface that instead of leaving
    // an unexplained black box on screen — most likely causes are a bad/
    // scoped-wrong token or no network access to Mapillary's CDN.
    const stallTimer = setTimeout(() => {
      if (!cancelled) {
        console.warn("[StreetSnap] mapillary-js never fired 'image' or 'load' within 12s for", view.startImageId);
        setLoadError((prev) => prev ?? "Still loading after 12s — check the browser console, and that your Mapillary token is valid.");
      }
    }, 12_000);
    // "load" (overall viewer/asset load) turned out to be an unreliable
    // signal in practice — it can take much longer than the current image
    // actually needs, or not fire at all, even once the photo is visibly
    // ready. "image" (the viewer's current image has been set) fires as
    // soon as the requested photo is actually showing, so readiness is now
    // gated on whichever of the two fires first.
    const markReady = () => {
      if (cancelled) return;
      clearTimeout(stallTimer);
      setReady(true);
      setLoadError(null);
    };

    (async () => {
      try {
        const { Viewer } = await import("mapillary-js");
        if (cancelled || !containerRef.current) return;
        const viewer = new Viewer({ container: containerRef.current, accessToken: view.accessToken, imageId: view.startImageId });
        viewer.on("image", (e) => {
          currentImageIdRef.current = e.image.id;
          markReady();
        });
        viewer.on("load", markReady);
        detachResize = attachResizeObserver(containerRef.current, viewer);
        viewerRef.current = viewer;
      } catch (err) {
        console.error("[StreetSnap] failed to construct viewer:", err);
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't load street imagery.");
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(stallTimer);
      detachResize?.();
      try {
        viewerRef.current?.remove();
      } catch {
        // ignore teardown errors
      }
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.startImageId]);

  async function captureCurrentCamera(): Promise<CameraState> {
    const viewer = viewerRef.current;
    if (!viewer) return { imageId: currentImageIdRef.current, center: [0.5, 0.5], zoom: 1 };
    try {
      const [center, zoom] = await Promise.all([viewer.getCenter(), viewer.getZoom()]);
      return { imageId: currentImageIdRef.current, center: [center[0] ?? 0.5, center[1] ?? 0.5], zoom };
    } catch {
      return { imageId: currentImageIdRef.current, center: [0.5, 0.5], zoom: 1 };
    }
  }

  async function takePhoto() {
    if (submittedRef.current) return;
    playSound("select");
    const camera = await captureCurrentCamera();
    onAction({ type: "submitPhoto", camera });
  }

  // Auto-submit whatever the player's currently framing if their own clock
  // runs out without them clicking the shutter — better than losing their
  // round entirely to an unlucky timeout.
  const autoSubmitted = useRef(false);
  useEffect(() => {
    autoSubmitted.current = false;
  }, [view.startImageId]);
  useEffect(() => {
    if (!view.exploreEndsAt) return;
    const msLeft = view.exploreEndsAt - Date.now();
    if (msLeft <= 0) return;
    const t = setTimeout(() => {
      if (!submittedRef.current && !autoSubmitted.current) {
        autoSubmitted.current = true;
        takePhoto();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, msLeft + 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.exploreEndsAt]);

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
        <div ref={containerRef} className="absolute inset-0" />
        {!ready && !loadError && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Loading street imagery…</div>
        )}
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-accent">
            Couldn't load the street view viewer: {loadError}
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500">Drag to look around, click the arrows on the ground to walk. Imagery © Mapillary contributors.</p>
      {view.yourPhotoSubmitted ? (
        <p className="text-sm text-emerald-400">📸 Photo taken! Waiting on {view.totalPlayers - view.submittedCount} more…</p>
      ) : (
        <button className="btn-gold text-lg" onClick={takePhoto} disabled={!ready}>
          📸 Take this photo
        </button>
      )}
    </div>
  );
}

function VotingPanel({
  view,
  onAction,
  meId,
  nameFor,
}: {
  view: ViewType;
  onAction: (action: StreetSnapAction) => void;
  meId: string;
  nameFor: (id: string) => string;
}) {
  const votable = (view.photos ?? []).filter((p) => p.playerId !== meId);
  const [index, setIndex] = useState(0);
  const current = votable[Math.min(index, Math.max(0, votable.length - 1))];
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ViewerType | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let detachResize: (() => void) | null = null;
    setReady(false);
    if (!current) return;
    (async () => {
      try {
        const { Viewer } = await import("mapillary-js");
        if (cancelled || !containerRef.current || !current.camera) return;
        const viewer = new Viewer({ container: containerRef.current, accessToken: view.accessToken, imageId: current.camera.imageId });
        // "load" alone turned out to be an unreliable readiness signal (see
        // ExploringPanel's comment) — apply the saved framing on whichever
        // of "image"/"load" fires first, guarded so it only runs once.
        let applied = false;
        const applyFraming = () => {
          if (cancelled || applied) return;
          applied = true;
          try {
            viewer.setCenter(current.camera!.center);
            viewer.setZoom(current.camera!.zoom);
          } catch {
            // best-effort — worst case the framing isn't restored exactly
          }
          setReady(true);
        };
        viewer.on("image", applyFraming);
        viewer.on("load", applyFraming);
        // Read-only: no walking/looking around someone else's shot, just
        // display it as they framed it. Attribution stays on, since this is
        // community-contributed imagery.
        for (const name of ["direction", "sequence", "pointer", "zoom"] as const) {
          try {
            viewer.deactivateComponent(name);
          } catch {
            // ignore if a given component name isn't available
          }
        }
        detachResize = attachResizeObserver(containerRef.current, viewer);
        viewerRef.current = viewer;
      } catch (err) {
        // leave `ready` false — panel shows a loading state indefinitely,
        // which is an acceptable degraded state for a single photo
        console.error("[StreetSnap] voting viewer failed to load:", err);
      }
    })();
    return () => {
      cancelled = true;
      detachResize?.();
      try {
        viewerRef.current?.remove();
      } catch {
        // ignore
      }
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.playerId, current?.camera?.imageId]);

  function vote() {
    if (!current || view.yourVote) return;
    playSound("select");
    onAction({ type: "vote", votedForPlayerId: current.playerId });
  }

  if (votable.length === 0) {
    return <p className="text-sm text-slate-400">Nobody else submitted a photo this round.</p>;
  }

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
        <div ref={containerRef} className="absolute inset-0" />
        {!ready && <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Loading photo…</div>}
      </div>
      <div className="flex items-center gap-4">
        <button className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setIndex((i) => (i - 1 + votable.length) % votable.length)} disabled={votable.length < 2}>
          ← Prev
        </button>
        <p className="text-sm text-slate-300">
          Photo {index + 1} of {votable.length} — by {current ? nameFor(current.playerId) : "…"}
        </p>
        <button className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setIndex((i) => (i + 1) % votable.length)} disabled={votable.length < 2}>
          Next →
        </button>
      </div>
      {view.yourVote ? (
        <p className="text-sm text-emerald-400">
          {view.yourVote === current?.playerId ? "✓ Your vote" : `You voted for ${nameFor(view.yourVote)}`}
        </p>
      ) : (
        <button className="btn-primary" onClick={vote}>
          Vote for this photo
        </button>
      )}
    </div>
  );
}
