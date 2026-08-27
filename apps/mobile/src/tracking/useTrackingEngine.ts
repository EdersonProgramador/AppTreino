import { useEffect, useState } from "react";
import { trackingEngine } from "./session/SessionManager";
import type { LiveSnapshot, TrackingSession } from "./types";

export function useTrackingEngine() {
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [orphan, setOrphan] = useState<TrackingSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      await trackingEngine.init();
      const recovered = await trackingEngine.recoverOrphan();
      // init/recover são assíncronos: sem esta guarda o subscribe vazaria
      // quando a tela é fechada antes de terminarem.
      if (cancelled) return;
      setOrphan(
        recovered && ["ORPHAN", "LIVE", "PAUSED"].includes(recovered.status) ? recovered : null
      );
      unsub = trackingEngine.subscribe(setSnap);
      setReady(true);
    })();
    return () => {
      cancelled = true;
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
