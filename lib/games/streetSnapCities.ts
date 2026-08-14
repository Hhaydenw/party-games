// Curated list of large, well-known cities to land in for Street Snap —
// picked for having enough real foot/street traffic (and therefore, in
// practice, denser Mapillary contributor coverage) to make "walk around for
// 3 minutes" actually work, rather than a uniformly-random point on Earth
// that might have zero nearby imagery. Coverage still isn't guaranteed for
// any single city on any given try — see streetSnap.ts's retry logic.
export interface CityDef {
  name: string;
  country: string;
  lat: number;
  lng: number;
  // How far from the exact center a random starting point may be picked,
  // in degrees — keeps rounds from always starting in the exact same spot
  // while staying within the city.
  spread: number;
}

export const CITIES: CityDef[] = [
  { name: "New York City", country: "USA", lat: 40.758, lng: -73.9855, spread: 0.03 },
  { name: "London", country: "UK", lat: 51.5074, lng: -0.1278, spread: 0.03 },
  { name: "Paris", country: "France", lat: 48.8566, lng: 2.3522, spread: 0.025 },
  { name: "Tokyo", country: "Japan", lat: 35.6762, lng: 139.6503, spread: 0.03 },
  { name: "Berlin", country: "Germany", lat: 52.52, lng: 13.405, spread: 0.03 },
  { name: "Amsterdam", country: "Netherlands", lat: 52.3676, lng: 4.9041, spread: 0.02 },
  { name: "Barcelona", country: "Spain", lat: 41.3874, lng: 2.1686, spread: 0.025 },
  { name: "Chicago", country: "USA", lat: 41.8781, lng: -87.6298, spread: 0.03 },
  { name: "San Francisco", country: "USA", lat: 37.7749, lng: -122.4194, spread: 0.025 },
  { name: "Sydney", country: "Australia", lat: -33.8688, lng: 151.2093, spread: 0.025 },
  { name: "Toronto", country: "Canada", lat: 43.6532, lng: -79.3832, spread: 0.03 },
  { name: "Chicago Loop", country: "USA", lat: 41.8827, lng: -87.6233, spread: 0.015 },
  { name: "Melbourne", country: "Australia", lat: -37.8136, lng: 144.9631, spread: 0.025 },
  { name: "Copenhagen", country: "Denmark", lat: 55.6761, lng: 12.5683, spread: 0.02 },
  { name: "Vienna", country: "Austria", lat: 48.2082, lng: 16.3738, spread: 0.025 },
  { name: "Prague", country: "Czechia", lat: 50.0755, lng: 14.4378, spread: 0.02 },
  { name: "Budapest", country: "Hungary", lat: 47.4979, lng: 19.0402, spread: 0.025 },
  { name: "Dublin", country: "Ireland", lat: 53.3498, lng: -6.2603, spread: 0.02 },
  { name: "Lisbon", country: "Portugal", lat: 38.7223, lng: -9.1393, spread: 0.02 },
  { name: "Seattle", country: "USA", lat: 47.6062, lng: -122.3321, spread: 0.025 },
  { name: "Boston", country: "USA", lat: 42.3601, lng: -71.0589, spread: 0.02 },
  { name: "Vancouver", country: "Canada", lat: 49.2827, lng: -123.1207, spread: 0.025 },
  { name: "Singapore", country: "Singapore", lat: 1.3521, lng: 103.8198, spread: 0.03 },
  { name: "Stockholm", country: "Sweden", lat: 59.3293, lng: 18.0686, spread: 0.025 },
  { name: "Zurich", country: "Switzerland", lat: 47.3769, lng: 8.5417, spread: 0.02 },
];
