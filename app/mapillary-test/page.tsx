import MapillaryTestClient from "./MapillaryTestClient";

// A bare, no-app-chrome diagnostic page: mounts mapillary-js directly
// against a single hardcoded, already-verified-good image, with none of
// Street Snap's game logic, React state machine, or Tailwind layout in the
// way. Purely to answer one question: does mapillary-js render anything at
// all in this browser/network, independent of everything else in the app.
export default function MapillaryTestPage() {
  const token = process.env.MAPILLARY_TOKEN ?? "";
  return <MapillaryTestClient token={token} />;
}
