import { useEffect, useRef } from "react";
import { activityMapSrc, mapsConfigMessage } from "../../lib/activity-map-src";

type Point = { lat: number; lng: number };

function samplePoints(points: Point[], max = 180) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const sampled: Point[] = [];
  for (let i = 0; i < max; i += 1) {
    sampled.push(points[Math.round(i * step)]);
  }
  return sampled;
}

function routeSvgPath(points: Point[]) {
  const sampled = samplePoints(points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)));
  if (sampled.length < 2) return null;
  let minLat = sampled[0].lat;
  let maxLat = sampled[0].lat;
  let minLng = sampled[0].lng;
  let maxLng = sampled[0].lng;
  for (const point of sampled) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  }
  const pad = 0.12;
  const latSpan = Math.max(0.0004, (maxLat - minLat) * (1 + pad * 2));
  const lngSpan = Math.max(0.0004, (maxLng - minLng) * (1 + pad * 2));
  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;
  const w = 320;
  const h = 168;
  const xy = (point: Point) => {
    const x = ((point.lng - (midLng - lngSpan / 2)) / lngSpan) * w;
    const y = h - ((point.lat - (midLat - latSpan / 2)) / latSpan) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const d = sampled.map((point, index) => `${index === 0 ? "M" : "L"}${xy(point)}`).join(" ");
  const start = sampled[0];
  const end = sampled[sampled.length - 1];
  return { d, start: xy(start), end: xy(end), w, h };
}

export function ActivityRoutePreview({
  points,
  mapType = "hybrid",
  is3d = false
}: {
  points: Point[];
  mapType?: "standard" | "satellite" | "hybrid" | "winter";
  is3d?: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const svg = routeSvgPath(points);

  function paint() {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const config = mapsConfigMessage();
    if (config) win.postMessage(config, "*");
    win.postMessage({ type: "showControls", on: false }, "*");
    win.postMessage({ type: "setFollow", on: false }, "*");
    win.postMessage({ type: "setMapType", mapType }, "*");
    win.postMessage({ type: "set3d", on: is3d }, "*");
    win.postMessage({ type: "setChromeInset", bottom: 12 }, "*");
    win.postMessage({ type: "setTrack", points, fit: points.length > 1 }, "*");
  }

  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === "ready") paint();
    };
    window.addEventListener("message", onMsg);
    const retries = [120, 400, 900].map((ms) => window.setTimeout(paint, ms));
    return () => {
      window.removeEventListener("message", onMsg);
      retries.forEach((id) => window.clearTimeout(id));
    };
  }, [points, mapType, is3d]);

  if (!svg) {
    return <div className="student-activity-share-map is-empty">Percurso curto demais para a prévia do mapa.</div>;
  }

  const [sx, sy] = svg.start.split(",");
  const [ex, ey] = svg.end.split(",");

  return (
    <div className="student-activity-share-map">
      <svg viewBox={`0 0 ${svg.w} ${svg.h}`} aria-hidden className="student-activity-share-map-svg">
        <path d={svg.d} fill="none" stroke="#2f7dff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={sx} cy={sy} r="5" fill="#2f7dff" stroke="#fff" strokeWidth="1.5" />
        <circle cx={ex} cy={ey} r="5" fill="#df663c" stroke="#fff" strokeWidth="1.5" />
      </svg>
      <iframe
        ref={iframeRef}
        title="Prévia do percurso"
        src={activityMapSrc()}
        allow="fullscreen"
        onLoad={() => paint()}
      />
    </div>
  );
}
