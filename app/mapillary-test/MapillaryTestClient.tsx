"use client";

import { useEffect, useRef, useState } from "react";
import "mapillary-js/dist/mapillary.css";

// Verified directly against the Mapillary API (not just guessed) to be a
// real, valid, perspective-camera image with a computed mesh — see the
// conversation this diagnostic page came out of. If this specific image
// still won't render here, the problem isn't image selection.
const TEST_IMAGE_ID = "2736147753342505"; // Paris

export default function MapillaryTestClient({ token }: { token: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [log, setLog] = useState<string[]>([]);
  const startRef = useRef<number>(Date.now());

  function line(msg: string) {
    const elapsed = ((Date.now() - startRef.current) / 1000).toFixed(1);
    setLog((prev) => [...prev, `[+${elapsed}s] ${msg}`]);
  }

  useEffect(() => {
    let cancelled = false;
    startRef.current = Date.now();
    line(`Starting. Token present: ${token ? "yes (" + token.slice(0, 8) + "…)" : "NO — MAPILLARY_TOKEN missing on server"}`);

    if (!token) return;

    (async () => {
      try {
        line("Importing mapillary-js…");
        const { Viewer } = await import("mapillary-js");
        line("mapillary-js imported OK.");
        if (cancelled || !containerRef.current) return;

        const viewer = new Viewer({ container: containerRef.current, accessToken: token });
        line("Viewer constructed.");

        viewer.on("image", (e) => line(`"image" event fired — current image id: ${e.image.id}`));
        viewer.on("load", () => line(`"load" event fired.`));
        viewer.on("dataloading", (e: any) => line(`"dataloading" event: loading=${e?.loading}`));

        requestAnimationFrame(() => requestAnimationFrame(() => viewer.resize()));
        new ResizeObserver(() => viewer.resize()).observe(containerRef.current);

        line(`Calling moveTo("${TEST_IMAGE_ID}")…`);
        await viewer.moveTo(TEST_IMAGE_ID);
        line("moveTo() resolved successfully.");
      } catch (err) {
        line(`ERROR: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
        console.error("[MapillaryTest]", err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div style={{ padding: 24, fontFamily: "monospace", color: "#eee", background: "#111", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 18, marginBottom: 12 }}>MapillaryJS bare-bones diagnostic</h1>
      <p style={{ marginBottom: 12, opacity: 0.7 }}>
        No app UI, no game logic — just mapillary-js and a known-good hardcoded image. If a real street photo shows
        below, mapillary-js works fine in this browser. If it's black, screenshot this whole page (the log below
        included) and send it back.
      </p>
      <div
        ref={containerRef}
        style={{ width: "100%", maxWidth: 900, height: 500, background: "#000", border: "2px solid #444", marginBottom: 16 }}
      />
      <div style={{ background: "#000", border: "1px solid #333", padding: 12, maxWidth: 900, fontSize: 12, lineHeight: 1.6 }}>
        {log.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}
