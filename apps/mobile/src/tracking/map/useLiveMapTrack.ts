import { useEffect, useState } from "react";
import { liveMapStore, type MapTrackPoint } from "./liveMapStore";

export function useLiveMapTrack() {
  const [points, setPoints] = useState<MapTrackPoint[]>(() => liveMapStore.getPoints());
  const [cursor, setCursor] = useState<MapTrackPoint | null>(() => liveMapStore.getCursor());

  useEffect(() => {
    return liveMapStore.subscribe((nextPoints, nextCursor) => {
      setPoints(nextPoints);
      setCursor(nextCursor);
    });
  }, []);

  return { points, cursor, clear: () => liveMapStore.clear() };
}
