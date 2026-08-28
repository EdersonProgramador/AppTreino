const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || "";
const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const GOOGLE_MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || "";

export function activityMapSrc() {
  if (MAPBOX_TOKEN) return "/activity-map.html";
  const qs = new URLSearchParams();
  if (GOOGLE_MAPS_KEY) qs.set("key", GOOGLE_MAPS_KEY);
  if (GOOGLE_MAPS_MAP_ID) qs.set("mapId", GOOGLE_MAPS_MAP_ID);
  const query = qs.toString();
  return query ? `/activity-map-google.html?${query}` : "/activity-map-google.html";
}

export function mapsConfigMessage(): Record<string, unknown> | null {
  if (MAPBOX_TOKEN) return { type: "setMapsConfig", mapboxToken: MAPBOX_TOKEN };
  if (!GOOGLE_MAPS_KEY) return null;
  return { type: "setMapsConfig", key: GOOGLE_MAPS_KEY, mapId: GOOGLE_MAPS_MAP_ID };
}
