import { useEffect, useState } from "react";
import { trackingEngine } from "./session/SessionManager";
import type { LiveSnapshot, TrackingSession } from "./types";

export function useTrackingEngine() {
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [orphan, setOrphan] = useState<TrackingSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    void (async () => {
      await trackingEngine.init();
      const recovered = await trackingEngine.recoverOrphan();
      setOrphan(
        recovered && ["ORPHAN", "LIVE", "PAUSED"].includes(recovered.status) ? recovered : null
      );
      unsub = trackingEngine.subscribe(setSnap);
      setReady(true);
    })();
    return () => {
      unsub?.();
    };
  }, []);

  return {
    ready,
    snap,
    orphan,
    engine: trackingEngine,
    clearOrphan: () => setOrphan(null)
  };
}
