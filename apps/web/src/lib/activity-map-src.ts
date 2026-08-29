const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || "";
const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const GOOGLE_MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || "";
const MAP_ASSET_VERSION = "sport-icons-5";

export function activityMapSrc() {
  if (MAPBOX_TOKEN) return `/activity-map.html?v=${MAP_ASSET_VERSION}`;
  const qs = new URLSearchParams();
  qs.set("v", MAP_ASSET_VERSION);
  if (GOOGLE_MAPS_KEY) qs.set("key", GOOGLE_MAPS_KEY);
  if (GOOGLE_MAPS_MAP_ID) qs.set("mapId", GOOGLE_MAPS_MAP_ID);
  return `/activity-map-google.html?${qs.toString()}`;
}

export function mapsConfigMessage(): Record<string, unknown> | null {
  if (MAPBOX_TOKEN) return { type: "setMapsConfig", mapboxToken: MAPBOX_TOKEN };
  if (!GOOGLE_MAPS_KEY) return null;
  return { type: "setMapsConfig", key: GOOGLE_MAPS_KEY, mapId: GOOGLE_MAPS_MAP_ID };
}
