"use client";

import { useEffect, useRef, useState } from "react";
import { CameraState, StreetSnapAction, StreetSnapView as ViewType } from "@/lib/games/streetSnap";
import { PlayerInfo } from "@/lib/types";
import { playSound } from "@/lib/sound";
import { serverNow } from "@/lib/serverClock";
import { useCountdown } from "@/lib/useCountdown";

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

// Post-capture "editing" is deliberately never baked into an exported
// image — it's applied live via CSS every time the photo is displayed
// (both in review and later in the voting/results grid), same as this
// game's whole "never extract the imagery" approach. Google's static
// images do have permissive CORS headers (confirmed live), so canvas-based
// editing would technically be possible, but there's no need to actually
// export/store pixels to deliver real filter/crop functionality.
const FILTER_PRESETS = [
  { id: "none", label: "Original", css: "" },
  { id: "grayscale", label: "B&W", css: "grayscale(1)" },
  { id: "sepia", label: "Sepia", css: "sepia(0.8)" },
  { id: "vintage", label: "Vintage", css: "sepia(0.35) contrast(1.1) saturate(1.3) brightness(0.95)" },
  { id: "cool", label: "Cool", css: "hue-rotate(15deg) saturate(1.1) brightness(1.05)" },
  { id: "warm", label: "Warm", css: "sepia(0.2) saturate(1.3) brightness(1.05)" },
  { id: "vivid", label: "Vivid", css: "saturate(1.6) contrast(1.15)" },
  { id: "noir", label: "Noir", css: "grayscale(1) contrast(1.4) brightness(0.9)" },
] as const;
// Combines the chosen filter preset with the fine-tune brightness/contrast/
// saturation adjustments into one CSS `filter` value — the preset (if any)
// supplies a baseline look, and the sliders layer additional adjustment
// functions on top, which is exactly how chained CSS filter functions are
// meant to compose (each one applies to the result of the last).
function editCss(edit: { filter?: string; brightness?: number; contrast?: number; saturation?: number }): string {
  const preset = FILTER_PRESETS.find((f) => f.id === edit.filter)?.css ?? "";
  const parts: string[] = [preset];
  const brightness = edit.brightness ?? 100;
  const contrast = edit.contrast ?? 100;
  const saturation = edit.saturation ?? 100;
  if (brightness !== 100) parts.push(`brightness(${brightness / 100})`);
  if (contrast !== 100) parts.push(`contrast(${contrast / 100})`);
  if (saturation !== 100) parts.push(`saturate(${saturation / 100})`);
  return parts.filter(Boolean).join(" ");
}
function cropTransform(camera: CameraState): string {
  const x = camera.cropX ?? 50;
  const y = camera.cropY ?? 50;
  const scale = camera.cropScale ?? 1;
  return `translate(${50 - x}%, ${50 - y}%) scale(${scale})`;
}

// A real top-level component (not declared inside ExploringPanel's render
// body) — a lesson learned the hard way on Color Match's sliders, where a
// per-render-redeclared component meant React tore down and rebuilt the
// underlying <input> on every parent re-render, breaking mid-drag. min=0
// max=200 with 100 as the unchanged midpoint mirrors how brightness/
// contrast/saturate CSS filter functions themselves work (1.0 = 100% =
// no change).
function EditSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      <span className="w-24 shrink-0 text-left">{label}</span>
      <input
        type="range"
        min={0}
        max={200}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-accent"
      />
      <span className="w-9 shrink-0 text-right font-mono">{value}%</span>
    </label>
  );
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

  // Only the exploring phase is timed — voting has no deadline (it ends
  // once everyone's voted, or the host manually skips it), so there's
  // nothing here to count down once the round moves past taking photos.
  const deadline = view.phase === "exploring" ? view.exploreEndsAt : null;
  const remainingMs = useCountdown(deadline, isHost, () => onAction({ type: "timeUp" })); // safety net in case someone's client didn't auto-submit (e.g. disconnected)

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

  // Camera-viewfinder overlay: right-click arms it (and suspends normal
  // click-to-walk navigation, so a left click can't accidentally do both),
  // Left-click only takes a photo while right-click is *held down* — not a
  // toggle. Holding right-click shows the crosshair overlay and suspends
  // normal click-to-walk navigation (so a left-click can't do both at
  // once); releasing right-click (anywhere, even outside the panorama —
  // tracked on the window, not just this element) goes straight back to
  // normal navigation, no photo taken. Purely additive — the always-visible
  // shutter button below still works regardless.
  const [aiming, setAiming] = useState(false);
  const aimingRef = useRef(false);
  aimingRef.current = aiming;

  function setClickToGo(enabled: boolean) {
    try {
      panoramaRef.current?.setOptions({ clickToGo: enabled });
    } catch {
      // ignore — panorama may not be constructed yet
    }
  }
  // Google's own click-and-drag rotation is bound internally to the *left*
  // mouse button, so once right-click is claimed for aiming, holding it
  // down doesn't rotate the view via the widget's own handling — we have
  // to drive `setPov()` ourselves from raw mouse movement while aiming.
  const lastDragPosRef = useRef<{ x: number; y: number } | null>(null);
  const povRef = useRef<{ heading: number; pitch: number } | null>(null);
  const ROTATE_DEG_PER_PX = 0.15;

  function enterAiming() {
    if (!ready || submittedRef.current || pendingCamera || aimingRef.current) return;
    setAiming(true);
    setClickToGo(false);
    lastDragPosRef.current = null;
    povRef.current = panoramaRef.current?.getPov() ?? null;
  }
  function exitAiming() {
    if (!aimingRef.current) return;
    setAiming(false);
    setClickToGo(true);
    lastDragPosRef.current = null;
    povRef.current = null;
  }
  useEffect(() => {
    // Window-level listeners so releasing the right mouse button (or
    // hitting Escape) always exits aiming, even if the cursor's drifted
    // outside the panorama while held.
    function onWindowMouseUp(e: MouseEvent) {
      if (e.button === 2) exitAiming();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") exitAiming();
    }
    function onWindowMouseMove(e: MouseEvent) {
      if (!aimingRef.current || !panoramaRef.current) return;
      const last = lastDragPosRef.current;
      lastDragPosRef.current = { x: e.clientX, y: e.clientY };
      if (!last) return; // first move since arming — just establish a baseline, no jump
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      const base = povRef.current ?? panoramaRef.current.getPov();
      const heading = base.heading + dx * ROTATE_DEG_PER_PX;
      const pitch = Math.max(-90, Math.min(90, base.pitch - dy * ROTATE_DEG_PER_PX));
      povRef.current = { heading, pitch };
      panoramaRef.current.setPov({ heading, pitch });
    }
    // Capture phase (the `true` third argument), not bubble — the Street
    // View widget's own internal canvas/drag handling can stop a mouse
    // event from bubbling back up to us, but a capture-phase listener on
    // window fires on the way *down*, before the event ever reaches that
    // internal element, so it can't be blocked that way.
    window.addEventListener("mouseup", onWindowMouseUp, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousemove", onWindowMouseMove);
    return () => {
      window.removeEventListener("mouseup", onWindowMouseUp, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousemove", onWindowMouseMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function captureCurrentCamera(): CameraState {
    const panorama = panoramaRef.current;
    if (!panorama) return { pano: view.startPano, heading: 0, pitch: 0, zoom: 1 };
    const pov = panorama.getPov();
    return { pano: panorama.getPano(), heading: pov.heading, pitch: pov.pitch, zoom: panorama.getZoom() ?? 1 };
  }

  // Taking a photo stages it locally for review (filter/crop) rather than
  // submitting immediately — nothing is sent to the server until "Submit
  // photo" is pressed.
  const [pendingCamera, setPendingCamera] = useState<CameraState | null>(null);
  const [filterId, setFilterId] = useState("none");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [cropPos, setCropPos] = useState({ x: 50, y: 50 });
  const [cropScale, setCropScale] = useState(1);
  const pendingRef = useRef<CameraState | null>(null);
  pendingRef.current = pendingCamera;
  const editRef = useRef({ filterId, brightness, contrast, saturation, cropPos, cropScale });
  editRef.current = { filterId, brightness, contrast, saturation, cropPos, cropScale };

  function startReview() {
    if (submittedRef.current || pendingCamera) return;
    playSound("shutter");
    setPendingCamera(captureCurrentCamera());
    setFilterId("none");
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setCropPos({ x: 50, y: 50 });
    setCropScale(1);
    if (aiming) exitAiming();
  }
  function retake() {
    setPendingCamera(null);
  }
  function confirmSubmit() {
    if (!pendingCamera) return;
    playSound("select");
    onAction({
      type: "submitPhoto",
      camera: { ...pendingCamera, filter: filterId, brightness, contrast, saturation, cropX: cropPos.x, cropY: cropPos.y, cropScale },
    });
    setPendingCamera(null);
  }

  const dragRef = useRef<{ startX: number; startY: number; startCropX: number; startCropY: number } | null>(null);
  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, startCropX: cropPos.x, startCropY: cropPos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pctX = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
    const pctY = ((e.clientY - dragRef.current.startY) / rect.height) * 100;
    setCropPos({
      x: Math.max(0, Math.min(100, dragRef.current.startCropX - pctX)),
      y: Math.max(0, Math.min(100, dragRef.current.startCropY - pctY)),
    });
  }
  function endDrag() {
    dragRef.current = null;
  }

  // Auto-submit whatever the player's currently framing/reviewing if their
  // own clock runs out without them confirming — better than losing their
  // round entirely to an unlucky timeout. Uses whatever they'd staged for
  // review (with its chosen filter/crop) if they got that far, else
  // captures fresh from the live panorama with defaults.
  const autoSubmitted = useRef(false);
  useEffect(() => {
    autoSubmitted.current = false;
  }, [view.startPano]);
  useEffect(() => {
    if (!view.exploreEndsAt) return;
    const msLeft = view.exploreEndsAt - serverNow();
    if (msLeft <= 0) return;
    const t = setTimeout(() => {
      if (submittedRef.current || autoSubmitted.current) return;
      autoSubmitted.current = true;
      const base = pendingRef.current ?? captureCurrentCamera();
      const { filterId: f, brightness: b, contrast: c2, saturation: s2, cropPos: c, cropScale: s } = editRef.current;
      onAction({ type: "submitPhoto", camera: { ...base, filter: f, brightness: b, contrast: c2, saturation: s2, cropX: c.x, cropY: c.y, cropScale: s } });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, msLeft + 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.exploreEndsAt]);

  // The panorama's DOM container must never be unmounted for the rest of
  // the round — Google's StreetViewPanorama is attached to that specific
  // element once, at construction, and nothing here ever re-attaches it to
  // a new one. Review and "submitted" used to be entirely separate early
  // `return`s with their own JSX, which meant the container div (rendered
  // only in the "live" branch) got unmounted the moment either kicked in;
  // retake() then just cleared local state and rendered a *fresh* empty
  // container that no panorama was ever attached to — a black screen, since
  // panoramaRef still pointed at the old, now-orphaned panorama object. Both
  // states are now overlays drawn on top of the one persistent panorama box
  // instead, so it's always there for retake to fall back to.
  const showReview = Boolean(pendingCamera);
  const showSubmitted = view.yourPhotoSubmitted && !showReview;

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-3">
      {showReview && <p className="text-sm font-semibold text-gold">Review your photo</p>}
      <div
        className="relative aspect-video w-full touch-none overflow-hidden rounded-2xl border border-white/10 bg-black"
        // Capture-phase (the "Capture" suffix) on all four — the Street
        // View widget's own canvas/drag handling can stop these events
        // from bubbling back out to a normal handler on this wrapper, but
        // capture-phase listeners fire on the way *down* to the target,
        // before that internal handling ever runs, so they can't be
        // blocked that way.
        onContextMenuCapture={(e) => e.preventDefault()}
        onMouseDownCapture={(e) => {
          if (e.button === 2) {
            e.preventDefault();
            enterAiming();
          }
        }}
        onMouseUpCapture={(e) => {
          if (e.button === 2) exitAiming();
        }}
        onClickCapture={() => {
          if (aiming) startReview();
        }}
      >
        <div ref={containerRef} className="absolute inset-0" />
        {!ready && !loadError && !showReview && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Loading street imagery…</div>
        )}
        {loadError && !showReview && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-accent">
            Couldn't load the street view: {loadError}
          </div>
        )}
        {aiming && !showReview && (
          // z-[999]: the Street View widget injects its own internal DOM
          // layers into containerRef (zoom controls, pegman, compass...)
          // and those commonly carry an explicit inline z-index from
          // Google's own script. Without an explicit z-index here, this
          // div being later in the DOM isn't enough to guarantee it paints
          // on top — an explicit-z-index sibling beats a z-index:auto one
          // regardless of DOM order. This was confirmed live: the
          // "aiming" state itself was toggling correctly (held true for
          // the full ~1s the button was held) but the overlay never
          // became visible, which is exactly what a stacking-context loss
          // looks like rather than a state/timing bug.
          <div className="pointer-events-none absolute inset-0 z-[999] flex items-center justify-center">
            <div className="absolute inset-6 rounded-lg border-2 border-white/30" />
            <div className="relative h-20 w-20">
              <div className="absolute inset-0 rounded-full border-2 border-white/80" />
              <div className="absolute left-1/2 top-0 h-3 w-0.5 -translate-x-1/2 bg-white/80" />
              <div className="absolute bottom-0 left-1/2 h-3 w-0.5 -translate-x-1/2 bg-white/80" />
              <div className="absolute left-0 top-1/2 h-0.5 w-3 -translate-y-1/2 bg-white/80" />
              <div className="absolute right-0 top-1/2 h-0.5 w-3 -translate-y-1/2 bg-white/80" />
            </div>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
              Left-click to snap 📸 — release right-click to cancel
            </div>
          </div>
        )}
        {showReview && pendingCamera && (
          <div
            className="absolute inset-0 z-[999] bg-black"
            style={{ cursor: cropScale > 1 ? "grab" : "default" }}
            onPointerDown={startDrag}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={buildStaticStreetViewUrl(view.mapsApiKey, pendingCamera)}
              alt="Your photo"
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
              style={{
                filter: editCss({ filter: filterId, brightness, contrast, saturation }),
                transform: `translate(${50 - cropPos.x}%, ${50 - cropPos.y}%) scale(${cropScale})`,
              }}
            />
          </div>
        )}
        {showSubmitted && (
          <div className="absolute inset-0 z-[999] flex items-center justify-center bg-black/85 px-6 text-center">
            <p className="text-sm text-emerald-400">📸 Photo taken! Waiting on {view.totalPlayers - view.submittedCount} more…</p>
          </div>
        )}
      </div>

      {showReview ? (
        <>
          <label className="flex w-full max-w-xs items-center gap-2 text-xs text-slate-400">
            🔍
            <input
              type="range"
              min={100}
              max={220}
              value={cropScale * 100}
              onChange={(e) => setCropScale(Number(e.target.value) / 100)}
              className="flex-1 accent-accent"
            />
          </label>
          {cropScale > 1 && <p className="text-xs text-slate-500">Drag the photo to reposition it</p>}
          <div className="flex flex-wrap justify-center gap-1.5">
            {FILTER_PRESETS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterId(f.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  filterId === f.id ? "bg-gold text-ink" : "bg-white/10 text-slate-300 hover:bg-white/20"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* Fine-tune sliders layered on top of whichever preset's chosen
              above — same live-CSS approach as everything else here, never
              baked into an exported image. */}
          <div className="flex w-full max-w-xs flex-col gap-1.5">
            <EditSlider label="☀️ Brightness" value={brightness} onChange={setBrightness} />
            <EditSlider label="◐ Contrast" value={contrast} onChange={setContrast} />
            <EditSlider label="🎨 Saturation" value={saturation} onChange={setSaturation} />
            {(brightness !== 100 || contrast !== 100 || saturation !== 100) && (
              <button
                className="self-center text-xs text-slate-500 underline hover:text-slate-300"
                onClick={() => {
                  setBrightness(100);
                  setContrast(100);
                  setSaturation(100);
                }}
              >
                Reset adjustments
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary" onClick={retake}>
              ↺ Retake
            </button>
            <button className="btn-gold" onClick={confirmSubmit}>
              ✓ Submit photo
            </button>
          </div>
        </>
      ) : !showSubmitted ? (
        <>
          <p className="text-xs text-slate-500">
            Drag to look around, click the arrows on the ground to walk — or hold right-click to aim, left-click
            while held to snap. © Google Street View.
          </p>
          <button className="btn-gold text-lg" onClick={startReview} disabled={!ready}>
            📸 Take this photo
          </button>
        </>
      ) : null}
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
  const [enlarged, setEnlarged] = useState<{ camera: CameraState; label: string } | null>(null);
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
        const label = isMine ? "Your photo" : nameFor(p.playerId);
        return (
          <PhotoTile
            key={p.playerId}
            apiKey={view.mapsApiKey}
            camera={p.camera}
            label={label}
            votes={p.votes}
            voterNames={p.voters.map(nameFor)}
            highlighted={isMyVote || isLeading}
            onEnlarge={p.camera ? () => setEnlarged({ camera: p.camera!, label }) : undefined}
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
      {enlarged && (
        <PhotoLightbox apiKey={view.mapsApiKey} camera={enlarged.camera} label={enlarged.label} onClose={() => setEnlarged(null)} />
      )}
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
  onEnlarge,
  children,
}: {
  apiKey: string;
  camera: CameraState | null;
  label: string;
  votes: number;
  voterNames: string[];
  highlighted: boolean;
  onEnlarge?: () => void;
  children?: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`overflow-hidden rounded-2xl border p-3 transition ${highlighted ? "border-gold ring-2 ring-gold/50" : "border-white/10"}`}>
      <button
        type="button"
        className="relative block aspect-video w-full cursor-zoom-in overflow-hidden rounded-xl bg-black"
        onClick={onEnlarge}
        disabled={!camera || !onEnlarge}
        title="Click to enlarge"
      >
        {camera && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={buildStaticStreetViewUrl(apiKey, camera)}
            alt={`Photo by ${label}`}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ filter: editCss(camera), transform: cropTransform(camera) }}
            onLoad={() => setLoaded(true)}
          />
        )}
        {!loaded && <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">Loading photo…</div>}
      </button>
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

// A simple full-screen overlay showing the same image bigger, dismissed by
// clicking the backdrop, the ✕ button, or Escape.
function PhotoLightbox({ apiKey, camera, label, onClose }: { apiKey: string; camera: CameraState; label: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <button
          className="absolute -top-10 right-0 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
          onClick={onClose}
        >
          ✕ Close
        </button>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={buildStaticStreetViewUrl(apiKey, camera)}
            alt={`Photo by ${label}`}
            className="block h-auto w-full"
            style={{ filter: editCss(camera), transform: cropTransform(camera) }}
          />
        </div>
        <p className="mt-2 text-center text-sm text-slate-300">{label}</p>
      </div>
    </div>
  );
}
