"use client";

import { useEffect, useId, useRef, useState } from "react";
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
//
// Capped at 80 (down from Google's real 120 max, and down again from an
// earlier 100 cap that still wasn't tight enough) — that's the actual
// "fisheye" complaint: at wide FOV, the Static API's flat perspective
// projection visibly bulges/stretches near the edges (an inherent property
// of rendering a wide field of view as a flat rectilinear image, not a bug
// in this app's code, but still bad enough wide to look broken). Reaching
// a wide fov means zooming out a lot live in the panorama; the crop slider
// below can zoom back in on the flat rendered image afterward without
// reintroducing any distortion, so capping the *captured* fov here doesn't
// cost much real framing flexibility.
function zoomToFov(zoom: number): number {
  return Math.round(Math.max(10, Math.min(80, 180 / Math.pow(2, zoom))));
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
  { id: "blackwhite", label: "Black & White", css: "grayscale(1)" },
  { id: "sepia", label: "Sepia", css: "sepia(0.8)" },
  { id: "vintage", label: "Vintage", css: "sepia(0.35) contrast(1.1) saturate(1.3) brightness(0.95)" },
  { id: "cool", label: "Cool", css: "hue-rotate(15deg) saturate(1.1) brightness(1.05)" },
  { id: "warm", label: "Warm", css: "sepia(0.2) saturate(1.3) brightness(1.05)" },
  { id: "vivid", label: "Vivid", css: "saturate(1.6) contrast(1.15)" },
  { id: "noir", label: "Noir", css: "grayscale(1) contrast(1.4) brightness(0.9)" },
] as const;

type EditFields = {
  filter?: string;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  curveLow?: number;
  curveHigh?: number;
  blur?: number;
  focusX?: number;
  focusY?: number;
  cropX?: number;
  cropY?: number;
  cropScale?: number;
  tilt?: number;
  vignette?: number;
};

// The filter preset plus brightness/contrast/saturation, as one CSS
// `filter` value — NOT blur or the B&W curve, which get applied
// separately (see EditedPhoto below): blur needs to skip the "in focus"
// region, and the curve goes through an SVG filter rather than a plain
// CSS function.
function baseEditCss(edit: EditFields): string {
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
// Crop (pan/zoom) and tilt (rotation) composed into one transform — order
// matters here: translate/scale first to reposition and zoom the crop
// window, then rotate on top of that, so tilting always spins around the
// center of the framed crop rather than the original image's center.
function cropTransform(camera: { cropX?: number; cropY?: number; cropScale?: number; tilt?: number }): string {
  const x = camera.cropX ?? 50;
  const y = camera.cropY ?? 50;
  const scale = camera.cropScale ?? 1;
  const tilt = camera.tilt ?? 0;
  return `translate(${50 - x}%, ${50 - y}%) scale(${scale}) rotate(${tilt}deg)`;
}
// A vignette can't go through the `filter` property, and — the actual bug
// here — box-shadow (including `inset`) doesn't work as an `<img>`'s own
// inline style either: box-shadow paints as part of a box's background/
// border layer, which is BEHIND a replaced element's own raster content, so
// an inset shadow set directly on an <img> is silently invisible no matter
// its opacity. Fixed by rendering the vignette as its own layered-on-top
// <div> (see EditedPhoto) with a radial-gradient background instead of a
// box-shadow — a sibling painted after the <img> in the same stacking
// context always renders above it.
function vignetteGradient(vignette?: number): string | undefined {
  const v = vignette ?? 0;
  if (v <= 0) return undefined;
  const innerStop = Math.max(15, 62 - v * 0.35);
  return `radial-gradient(ellipse at center, transparent ${innerStop}%, rgba(0,0,0,${(v / 100) * 0.85}) 100%)`;
}

// A real tone curve — 4 control points (fixed black/white endpoints at
// (0,0)/(255,255) plus 2 draggable midtone points at fixed x=85/x=170,
// only their output y is adjustable), piecewise-linearly interpolated and
// sampled into the table SVG's <feFuncR/G/B type="table"> expects. This is
// what actually lets someone reshape a B&W conversion's tonal response
// (crush shadows, blow out highlights, an S-curve for punch, ...) instead
// of just a flat "how much grayscale" slider.
function curveTableValues(low: number, high: number, steps = 16): string {
  const points: [number, number][] = [
    [0, 0],
    [85, low],
    [170, high],
    [255, 255],
  ];
  const values: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (255 * i) / steps;
    let y = 255;
    for (let s = 0; s < points.length - 1; s++) {
      const [x0, y0] = points[s]!;
      const [x1, y1] = points[s + 1]!;
      if (x >= x0 && x <= x1) {
        const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
        y = y0 + t * (y1 - y0);
        break;
      }
    }
    values.push(Math.max(0, Math.min(1, y / 255)));
  }
  return values.map((v) => v.toFixed(3)).join(" ");
}

// Every displayed photo gets a tiny hidden per-instance SVG <filter>,
// referenced from the actual <img> via `filter: url(#id) ...` alongside
// the plain CSS filter functions from baseEditCss (SVG filter references
// and CSS filter functions chain together fine in one `filter` value).
// Two things live in it, always:
//  - The tone curve (feComponentTransfer, per-channel), reshaping whatever
//    colors/grays are already there — see EditedPhoto for why it's placed
//    last in the filter chain, after the "Black & White" preset (if any)
//    has already run. Defaults to an identity mapping when untouched.
//  - A mild sharpen convolution. The Static API caps images at 640x640
//    regardless of how large they're actually displayed (see
//    buildStaticStreetViewUrl) — upscaled past that on any higher-DPI/
//    Retina screen (trivially easy), it looks soft. This counteracts that.
function SnapSvgFilters({ id, curveLow, curveHigh }: { id: string; curveLow?: number; curveHigh?: number }) {
  const table = curveTableValues(curveLow ?? 85, curveHigh ?? 170);
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <filter id={id} colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="table" tableValues={table} />
            <feFuncG type="table" tableValues={table} />
            <feFuncB type="table" tableValues={table} />
          </feComponentTransfer>
          <feConvolveMatrix order={3} kernelMatrix="0 -1 0 -1 5 -1 0 -1 0" divisor={1} preserveAlpha="true" />
        </filter>
      </defs>
    </svg>
  );
}

// Renders a photo with every edit applied — filter/curve/crop/tilt/
// vignette, plus a genuinely *selective* blur rather than blurring the
// whole frame. True depth-of-field isn't something a single CSS filter can
// do, but stacking two copies of the same image (one sharp, one blurred)
// and masking the blurred one with a radial gradient centered on the
// chosen focus point — transparent there (revealing the sharp copy
// beneath), opaque everywhere else — gets a convincing version of it with
// nothing but CSS. Used identically in review, the voting/results grid,
// and the lightbox, so what's tuned in review is exactly what everyone
// else sees.
function EditedPhoto({ src, alt, camera, imgClassName, onLoad }: { src: string; alt: string; camera: EditFields; imgClassName: string; onLoad?: () => void }) {
  const rawId = useId();
  const filterId = `ssfx-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const transform = cropTransform(camera);
  const vignetteBg = vignetteGradient(camera.vignette);
  const base = baseEditCss(camera);
  const curveUrl = `url(#${filterId})`;
  const blurAmt = camera.blur ?? 0;
  const focusX = camera.focusX ?? 50;
  const focusY = camera.focusY ?? 50;
  // `base` (filter preset — including "Black & White" — plus brightness/
  // contrast/saturation) runs FIRST, then the curve runs LAST: it's meant
  // to reshape whatever's already on screen at that point, same as a
  // Curves adjustment sitting at the top of the stack in a real photo
  // editor, which is what actually makes it "adjust black and white if
  // black and white is selected" rather than fighting with it.
  const sharpFilter = [base, curveUrl].filter(Boolean).join(" ");

  return (
    <>
      <SnapSvgFilters id={filterId} curveLow={camera.curveLow} curveHigh={camera.curveHigh} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} draggable={false} className={imgClassName} style={{ filter: sharpFilter, transform }} onLoad={onLoad} />
      {blurAmt > 0 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          className={imgClassName}
          style={{
            filter: [base, curveUrl, `blur(${blurAmt}px)`].filter(Boolean).join(" "),
            transform,
            WebkitMaskImage: `radial-gradient(circle at ${focusX}% ${focusY}%, transparent 0%, transparent 12%, black 42%, black 100%)`,
            maskImage: `radial-gradient(circle at ${focusX}% ${focusY}%, transparent 0%, transparent 12%, black 42%, black 100%)`,
          }}
        />
      )}
      {/* Layered on top as its own element, not an <img>'s box-shadow — see
          vignetteGradient's comment for why that doesn't render. */}
      {vignetteBg && (
        <div className={imgClassName} style={{ backgroundImage: vignetteBg, transform, pointerEvents: "none" }} />
      )}
    </>
  );
}

// A real top-level component (not declared inside ExploringPanel's render
// body) — a lesson learned the hard way on Color Match's sliders, where a
// per-render-redeclared component meant React tore down and rebuilt the
// underlying <input> on every parent re-render, breaking mid-drag.
function EditSlider({
  label,
  value,
  min = 0,
  max = 200,
  unit = "%",
  resetTo,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  resetTo: number; // double-click the slider to snap back to this
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-400" title={`Double-click the slider to reset to ${resetTo}${unit}`}>
      <span className="w-20 shrink-0 text-left">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(resetTo)}
        className="flex-1 accent-accent"
      />
      <span className="w-11 shrink-0 text-right font-mono">
        {value}
        {unit}
      </span>
    </label>
  );
}

// A Photoshop-Curves-style editor: a square grid, the reference diagonal,
// the actual curve (piecewise-linear through the fixed endpoints and the 2
// draggable midtone points), and two draggable handles. Deliberately
// vertical-only dragging at fixed x-positions (thirds) rather than fully
// free placement — still a real curve (can shape an S-curve, crush
// shadows, blow highlights, ...), but avoids the extra complexity of
// points crossing each other or needing to be kept in x-order.
const CURVE_SIZE = 180;
function CurveEditor({ low, high, onChange }: { low: number; high: number; onChange: (low: number, high: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"low" | "high" | null>(null);

  function yToPixel(y: number) {
    return CURVE_SIZE - (y / 255) * CURVE_SIZE;
  }
  function pixelToY(py: number) {
    return Math.max(0, Math.min(255, Math.round(((CURVE_SIZE - py) / CURVE_SIZE) * 255)));
  }
  function handleMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const y = pixelToY(e.clientY - rect.top);
    if (draggingRef.current === "low") onChange(y, high);
    else onChange(low, y);
  }
  function startDrag(which: "low" | "high") {
    return (e: React.PointerEvent) => {
      draggingRef.current = which;
      (e.target as Element).setPointerCapture(e.pointerId);
    };
  }
  function endDrag() {
    draggingRef.current = null;
  }

  const lowX = (85 / 255) * CURVE_SIZE;
  const lowY = yToPixel(low);
  const highX = (170 / 255) * CURVE_SIZE;
  const highY = yToPixel(high);

  return (
    <div
      ref={containerRef}
      className="relative touch-none self-center rounded-lg border border-white/15 bg-black/40"
      style={{ width: CURVE_SIZE, height: CURVE_SIZE }}
      onPointerMove={handleMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      <svg width={CURVE_SIZE} height={CURVE_SIZE} className="absolute inset-0">
        {[1, 2, 3].map((i) => (
          <line key={`v${i}`} x1={(CURVE_SIZE / 4) * i} y1={0} x2={(CURVE_SIZE / 4) * i} y2={CURVE_SIZE} stroke="rgba(255,255,255,0.1)" />
        ))}
        {[1, 2, 3].map((i) => (
          <line key={`h${i}`} x1={0} y1={(CURVE_SIZE / 4) * i} x2={CURVE_SIZE} y2={(CURVE_SIZE / 4) * i} stroke="rgba(255,255,255,0.1)" />
        ))}
        <line x1={0} y1={CURVE_SIZE} x2={CURVE_SIZE} y2={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
        <polyline points={`0,${CURVE_SIZE} ${lowX},${lowY} ${highX},${highY} ${CURVE_SIZE},0`} fill="none" stroke="#f2b705" strokeWidth={2} />
      </svg>
      <div
        className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-ink bg-gold active:cursor-grabbing"
        style={{ left: lowX, top: lowY }}
        onPointerDown={startDrag("low")}
        onDoubleClick={() => onChange(85, high)}
        title="Shadows/lower-midtones — double-click to reset"
      />
      <div
        className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-ink bg-gold active:cursor-grabbing"
        style={{ left: highX, top: highY }}
        onPointerDown={startDrag("high")}
        onDoubleClick={() => onChange(low, 170)}
        title="Highlights/upper-midtones — double-click to reset"
      />
    </div>
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
  const [curveLow, setCurveLow] = useState(85);
  const [curveHigh, setCurveHigh] = useState(170);
  const [blur, setBlur] = useState(0);
  const [focusPos, setFocusPos] = useState({ x: 50, y: 50 });
  const [tilt, setTilt] = useState(0);
  const [vignette, setVignette] = useState(0);
  const [cropPos, setCropPos] = useState({ x: 50, y: 50 });
  const [cropScale, setCropScale] = useState(1);
  const pendingRef = useRef<CameraState | null>(null);
  pendingRef.current = pendingCamera;
  const editRef = useRef({
    filterId,
    brightness,
    contrast,
    saturation,
    curveLow,
    curveHigh,
    blur,
    focusPos,
    tilt,
    vignette,
    cropPos,
    cropScale,
  });
  editRef.current = { filterId, brightness, contrast, saturation, curveLow, curveHigh, blur, focusPos, tilt, vignette, cropPos, cropScale };

  function resetEdits() {
    setFilterId("none");
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setCurveLow(85);
    setCurveHigh(170);
    setBlur(0);
    setFocusPos({ x: 50, y: 50 });
    setTilt(0);
    setVignette(0);
    setCropPos({ x: 50, y: 50 });
    setCropScale(1);
  }

  function startReview() {
    if (submittedRef.current || pendingCamera) return;
    playSound("shutter");
    setPendingCamera(captureCurrentCamera());
    resetEdits();
    if (aiming) exitAiming();
  }
  function retake() {
    // Explicitly put the live panorama back exactly where the photo was
    // framed, rather than trusting it to have stayed there on its own —
    // it's covered by an opaque overlay during review, not disabled, so
    // anything that can still move it while hidden (Street View's own
    // keyboard navigation, for one, which nothing here turns off) used to
    // leave the live view sitting wherever it drifted to instead of back
    // where the player actually was.
    if (pendingCamera && panoramaRef.current) {
      try {
        panoramaRef.current.setPano(pendingCamera.pano);
        panoramaRef.current.setPov({ heading: pendingCamera.heading, pitch: pendingCamera.pitch });
        panoramaRef.current.setZoom(pendingCamera.zoom);
      } catch {
        // best-effort — if this throws, showing the live view as-is beats a black screen
      }
    }
    setPendingCamera(null);
  }
  function confirmSubmit() {
    if (!pendingCamera) return;
    playSound("select");
    onAction({
      type: "submitPhoto",
      camera: {
        ...pendingCamera,
        filter: filterId,
        brightness,
        contrast,
        saturation,
        curveLow,
        curveHigh,
        blur,
        focusX: focusPos.x,
        focusY: focusPos.y,
        tilt,
        vignette,
        cropX: cropPos.x,
        cropY: cropPos.y,
        cropScale,
      },
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
  //
  // Fires *ahead* of the deadline (not after it) — this used to fire at
  // deadline+50ms, but the round's own timeUp (which any client, usually
  // the host, fires as soon as its clock hits zero — see useCountdown) can
  // land anywhere in a 0-250ms window after the same deadline. Whichever
  // one reaches the server first wins: if the host's timeUp got there
  // first, phase had already moved past "exploring" by the time this
  // player's own accurate submission arrived, so the server's own
  // fallback (a plain shot of the round's starting view, for anyone still
  // missing a photo) silently won instead — which is exactly the "random
  // photo, not what I was framing" bug. Firing comfortably *before* the
  // deadline instead means this player's real, current framing is
  // guaranteed to reach the server first.
  const AUTO_SUBMIT_LEAD_MS = 400;
  const autoSubmitted = useRef(false);
  useEffect(() => {
    autoSubmitted.current = false;
  }, [view.startPano]);
  useEffect(() => {
    if (!view.exploreEndsAt) return;
    const msLeft = view.exploreEndsAt - serverNow() - AUTO_SUBMIT_LEAD_MS;
    if (msLeft <= 0) return;
    const t = setTimeout(() => {
      if (submittedRef.current || autoSubmitted.current) return;
      autoSubmitted.current = true;
      const base = pendingRef.current ?? captureCurrentCamera();
      const e = editRef.current;
      onAction({
        type: "submitPhoto",
        camera: {
          ...base,
          filter: e.filterId,
          brightness: e.brightness,
          contrast: e.contrast,
          saturation: e.saturation,
          curveLow: e.curveLow,
          curveHigh: e.curveHigh,
          blur: e.blur,
          focusX: e.focusPos.x,
          focusY: e.focusPos.y,
          tilt: e.tilt,
          vignette: e.vignette,
          cropX: e.cropPos.x,
          cropY: e.cropPos.y,
          cropScale: e.cropScale,
        },
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, msLeft);
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
            style={{ cursor: blur > 0 ? "crosshair" : cropScale > 1 ? "grab" : "default" }}
            onPointerDown={startDrag}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onClick={(e) => {
              // Click to set the in-focus point — only meaningful once
              // there's actually a blur to leave a hole in.
              if (blur <= 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              setFocusPos({
                x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
                y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
              });
            }}
          >
            <EditedPhoto
              src={buildStaticStreetViewUrl(view.mapsApiKey, pendingCamera)}
              alt="Your photo"
              camera={{ filter: filterId, brightness, contrast, saturation, curveLow, curveHigh, blur, focusX: focusPos.x, focusY: focusPos.y, cropX: cropPos.x, cropY: cropPos.y, cropScale, tilt, vignette }}
              imgClassName="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
            />
            {/* Rule-of-thirds grid — only useful (and only shown) once
                there's actually room to reposition, i.e. zoomed in past
                100%, same as the "drag to reposition" hint below. */}
            {cropScale > 1 && (
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="border border-white/25" />
                ))}
              </div>
            )}
            {/* Marks where the blur currently leaves things in focus. */}
            {blur > 0 && (
              <div
                className="pointer-events-none absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold/90 shadow-[0_0_0_2000px_rgba(0,0,0,0.15)]"
                style={{ left: `${focusPos.x}%`, top: `${focusPos.y}%` }}
              />
            )}
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
          <div className="flex w-full max-w-xs items-center gap-2">
            <label className="flex flex-1 items-center gap-2 text-xs text-slate-400">
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
            {(cropScale > 1 || cropPos.x !== 50 || cropPos.y !== 50) && (
              <button
                className="shrink-0 text-xs text-slate-500 underline hover:text-slate-300"
                onClick={() => {
                  setCropScale(1);
                  setCropPos({ x: 50, y: 50 });
                }}
              >
                Reset crop
              </button>
            )}
          </div>
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
            <EditSlider label="☀️ Brightness" value={brightness} resetTo={100} onChange={setBrightness} />
            <EditSlider label="◐ Contrast" value={contrast} resetTo={100} onChange={setContrast} />
            <EditSlider label="🎨 Saturation" value={saturation} resetTo={100} onChange={setSaturation} />
            <EditSlider label="🌫️ Focus blur" value={blur} max={8} unit="px" resetTo={0} onChange={setBlur} />
            {blur > 0 && (
              <p className="-mt-1 text-center text-[11px] text-slate-500">Tap the photo above to move the in-focus spot.</p>
            )}
            <EditSlider label="📐 Tilt" value={tilt} min={-30} max={30} unit="°" resetTo={0} onChange={setTilt} />
            <EditSlider label="🖤 Vignette" value={vignette} max={100} resetTo={0} onChange={setVignette} />
            {/* A general color curve, not tied to any one filter — pick
                "Black & White" above and this curve shapes its tones;
                leave a color preset selected and it shapes those instead. */}
            <div className="flex flex-col items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 p-2">
              <p className="text-xs font-semibold text-slate-300">🎨 Color curve</p>
              <CurveEditor low={curveLow} high={curveHigh} onChange={(lo, hi) => { setCurveLow(lo); setCurveHigh(hi); }} />
            </div>
            {(brightness !== 100 ||
              contrast !== 100 ||
              saturation !== 100 ||
              curveLow !== 85 ||
              curveHigh !== 170 ||
              blur !== 0 ||
              tilt !== 0 ||
              vignette !== 0) && (
              <button
                className="self-center text-xs text-slate-500 underline hover:text-slate-300"
                onClick={() => {
                  setBrightness(100);
                  setContrast(100);
                  setSaturation(100);
                  setCurveLow(85);
                  setCurveHigh(170);
                  setBlur(0);
                  setTilt(0);
                  setVignette(0);
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
          <EditedPhoto
            src={buildStaticStreetViewUrl(apiKey, camera)}
            alt={`Photo by ${label}`}
            camera={camera}
            imgClassName="absolute inset-0 h-full w-full object-cover"
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
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
          <EditedPhoto
            src={buildStaticStreetViewUrl(apiKey, camera)}
            alt={`Photo by ${label}`}
            camera={camera}
            imgClassName="absolute inset-0 h-full w-full object-cover"
          />
        </div>
        <p className="mt-2 text-center text-sm text-slate-300">{label}</p>
      </div>
    </div>
  );
}
