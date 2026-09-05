import { assetUrl } from "./urls";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || "";
const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const GOOGLE_MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || "";
const MAP_ASSET_VERSION = "share-sport-pin-2";

export function hasActivityMapProvider() {
  return Boolean(MAPBOX_TOKEN || GOOGLE_MAPS_KEY);
}

export function activityMapSrc(opts?: { preview?: boolean; hideLive?: boolean }) {
  const qs = new URLSearchParams();
  qs.set("v", MAP_ASSET_VERSION);
  if (opts?.preview) qs.set("preview", "1");
  if (opts?.hideLive) qs.set("hidelive", "1");
  if (MAPBOX_TOKEN) {
    qs.set("mb", MAPBOX_TOKEN);
    return `${assetUrl("activity-map.html")}?${qs.toString()}`;
  }
  if (GOOGLE_MAPS_KEY) qs.set("key", GOOGLE_MAPS_KEY);
  if (GOOGLE_MAPS_MAP_ID) qs.set("mapId", GOOGLE_MAPS_MAP_ID);
  return `${assetUrl("activity-map-google.html")}?${qs.toString()}`;
}

export function mapsConfigMessage(): Record<string, unknown> | null {
  if (MAPBOX_TOKEN) return { type: "setMapsConfig", mapboxToken: MAPBOX_TOKEN };
  if (!GOOGLE_MAPS_KEY) return null;
  return { type: "setMapsConfig", key: GOOGLE_MAPS_KEY, mapId: GOOGLE_MAPS_MAP_ID };
}
