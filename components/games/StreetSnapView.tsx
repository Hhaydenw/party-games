"use client";

import { useEffect, useRef, useState } from "react";
import { CameraState, StreetSnapAction, StreetSnapView as ViewType } from "@/lib/games/streetSnap";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";

// Guards so the Maps JS API's options are only set once per page (the
// loader errors if you try to change them after a library's already been
// requested) and so every viewer instance shares one in-flight import
// rather than each racing to request the script separately.
let optionsSet = false;
let streetViewLibraryPromise: Promise<google.maps.StreetViewLibrary> | null = null;
let coreLibraryPromise: Promise<google.maps.CoreLibrary> | null = null;

async function loadStreetView(apiKey: string): Promise<{ StreetViewPanorama: typeof google.maps.StreetViewPanorama; event: typeof google.maps.event }> {
  const { setOptions, importLibrary } = await import("@googlemaps/js-api-loader");
  if (!optionsSet) {
    setOptions({ key: apiKey, v: "weekly" });
    optionsSet = true;
  }
  streetViewLibraryPromise ??= importLibrary("streetView");
  coreLibraryPromise ??= importLibrary("core");
  const [streetView, core] = await Promise.all([streetViewLibraryPromise, coreLibraryPromise]);
  return { StreetViewPanorama: streetView.StreetViewPanorama, event: core.event };
}

// The Street View Static API's `fov` (degrees, 10-120, default 90) doesn't
// map 1:1 to the JS API's `zoom` (roughly 0-5, no fixed upper bound) — this
// is the commonly-used approximation (halving the field of view per zoom
// level), close enough for a voting-display image that doesn't need to
// pixel-match the interactive view exactly.
function zoomToFov(zoom: number): number {
  return Math.round(Math.max(10, Math.min(120, 180 / Math.pow(2, zoom))));
}

function buildStaticStreetViewUrl(apiKey: string, camera: CameraState): string {
  const params = new URLSearchParams({
    // The Street View Static API caps images at 640x640 on the standard
    // tier regardless of what's requested (confirmed live) — asking for
    // exactly that instead of a larger size that gets silently downscaled
    // anyway keeps the request (and its cost) honest.
    size: "640x640",
    pano: camera.pano,
    heading: String(camera.heading),
    pitch: String(camera.pitch),
    fov: String(zoomToFov(camera.zoom)),
    key: apiKey,
  });
  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
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
      {(view.phase === "voting" || view.phase === "roundEnd" || view.phase === "finished") && (
        <PhotoGrid view={view} onAction={onAction} meId={meId} nameFor={nameFor} interactive={view.phase === "voting"} />
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
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const submittedRef = useRef(view.yourPhotoSubmitted);
  submittedRef.current = view.yourPhotoSubmitted;

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setLoadError(null);

    const stallTimer = setTimeout(() => {
      if (!cancelled) {
        console.warn("[StreetSnap] Street View panorama never became ready within 12s for", view.startPano);
        setLoadError((prev) => prev ?? "Still loading after 12s — check the browser console, and that your Google Maps API key is valid and has billing enabled.");
      }
    }, 12_000);

    (async () => {
      try {
        const { StreetViewPanorama, event } = await loadStreetView(view.mapsApiKey);
        if (cancelled || !containerRef.current) return;
        const panorama = new StreetViewPanorama(containerRef.current, {
          pano: view.startPano,
          addressControl: false,
          showRoadLabels: false,
          fullscreenControl: false,
          motionTracking: false,
          motionTrackingControl: false,
          clickToGo: true,
          linksControl: true,
          panControl: true,
          zoomControl: true,
        });
        panorama.addListener("status_changed", () => {
          if (cancelled) return;
          clearTimeout(stallTimer);
          setReady(true);
          setLoadError(null);
        });
        panoramaRef.current = panorama;
        requestAnimationFrame(() => requestAnimationFrame(() => event.trigger(panorama, "resize")));
      } catch (err) {
        console.error("[StreetSnap] failed to load Street View:", err);
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't load street imagery.");
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(stallTimer);
      panoramaRef.current = null;
    };
  }, [view.startPano, view.mapsApiKey]);

  function captureCurrentCamera(): CameraState {
    const panorama = panoramaRef.current;
    if (!panorama) return { pano: view.startPano, heading: 0, pitch: 0, zoom: 1 };
    const pov = panorama.getPov();
    return { pano: panorama.getPano(), heading: pov.heading, pitch: pov.pitch, zoom: panorama.getZoom() ?? 1 };
  }

  function takePhoto() {
    if (submittedRef.current) return;
    playSound("select");
    onAction({ type: "submitPhoto", camera: captureCurrentCamera() });
  }

  // Auto-submit whatever the player's currently framing if their own clock
  // runs out without them clicking the shutter — better than losing their
  // round entirely to an unlucky timeout.
  const autoSubmitted = useRef(false);
  useEffect(() => {
    autoSubmitted.current = false;
  }, [view.startPano]);
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
            Couldn't load the street view: {loadError}
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500">Drag to look around, click the arrows on the ground to walk. © Google Street View.</p>
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

// Shared by both the voting phase and the results screens — everyone's
// photo shown together (not a one-at-a-time carousel), with live vote
// attribution (who's picked what, not just a count) that updates as votes
// come in, since the underlying view data is already live during voting,
// not just revealed afterward. `interactive` controls whether vote buttons
// show at all; the results screens reuse the exact same grid read-only.
function PhotoGrid({
  view,
  onAction,
  meId,
  nameFor,
  interactive,
}: {
  view: ViewType;
  onAction: (action: StreetSnapAction) => void;
  meId: string;
  nameFor: (id: string) => string;
  interactive: boolean;
}) {
  const photos = view.photos ?? [];
  if (photos.length === 0) {
    return <p className="text-sm text-slate-400">Nobody submitted a photo this round.</p>;
  }
  const maxVotes = Math.max(0, ...photos.map((p) => p.votes));

  function vote(playerId: string) {
    if (view.yourVote) return;
    playSound("select");
    onAction({ type: "vote", votedForPlayerId: playerId });
  }

  return (
    <div className="grid w-full max-w-5xl gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {photos.map((p) => {
        const isMine = p.playerId === meId;
        const isMyVote = view.yourVote === p.playerId;
        const isLeading = !interactive && p.votes > 0 && p.votes === maxVotes;
        return (
          <PhotoTile
            key={p.playerId}
            apiKey={view.mapsApiKey}
            camera={p.camera}
            label={isMine ? "Your photo" : nameFor(p.playerId)}
            votes={p.votes}
            voterNames={p.voters.map(nameFor)}
            highlighted={isMyVote || isLeading}
          >
            {interactive && !isMine && (
              <button
                className={`mt-2 w-full rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  isMyVote ? "bg-gold/20 text-gold" : "btn-primary disabled:opacity-40"
                }`}
                disabled={Boolean(view.yourVote) && !isMyVote}
                onClick={() => vote(p.playerId)}
              >
                {isMyVote ? "✓ Your vote" : "Vote for this photo"}
              </button>
            )}
          </PhotoTile>
        );
      })}
    </div>
  );
}

function PhotoTile({
  apiKey,
  camera,
  label,
  votes,
  voterNames,
  highlighted,
  children,
}: {
  apiKey: string;
  camera: CameraState | null;
  label: string;
  votes: number;
  voterNames: string[];
  highlighted: boolean;
  children?: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`overflow-hidden rounded-2xl border p-3 transition ${highlighted ? "border-gold ring-2 ring-gold/50" : "border-white/10"}`}>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
        {camera && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={buildStaticStreetViewUrl(apiKey, camera)}
            alt={`Photo by ${label}`}
            className="absolute inset-0 h-full w-full object-cover"
            onLoad={() => setLoaded(true)}
          />
        )}
        {!loaded && <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">Loading photo…</div>}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-sm font-semibold">{label}</p>
        <span className="text-xs font-bold text-gold">
          {votes} vote{votes === 1 ? "" : "s"}
        </span>
      </div>
      {/* Live feedback — who's currently voted for this photo, updating in
          real time as votes come in during the voting phase itself. */}
      {voterNames.length > 0 && <p className="mt-1 truncate text-xs text-slate-400">❤️ {voterNames.join(", ")}</p>}
      {children}
    </div>
  );
}
