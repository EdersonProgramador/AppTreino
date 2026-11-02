import { RefreshCw, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { usePwaUpdateStore } from "../../stores/pwaUpdateStore";

export function PwaUpdateBanner() {
  const visible = usePwaUpdateStore((s) => s.visible);
  const applying = usePwaUpdateStore((s) => s.applying);
  const runUpdate = usePwaUpdateStore((s) => s.runUpdate);
  const dismissForSession = usePwaUpdateStore((s) => s.dismissForSession);

  useEffect(() => {
    if (!visible || typeof document === "undefined") return;
    document.documentElement.classList.add("has-pwa-update-prompt");
    return () => {
      document.documentElement.classList.remove("has-pwa-update-prompt");
    };
  }, [visible]);

  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div className="pwa-update-banner" role="dialog" aria-labelledby="pwa-update-title" aria-modal="true">
      <button
        type="button"
        className="pwa-update-banner-backdrop"
        aria-label="Depois"
        onClick={() => dismissForSession()}
      />
      <div className="pwa-update-banner-panel">
        <div className="pwa-update-banner-inner">
          <RefreshCw size={22} className="pwa-update-banner-icon" aria-hidden="true" />
          <div className="pwa-update-banner-copy">
            <strong id="pwa-update-title">Nova versão do ATLLY</strong>
            <span>Atualize para aplicar correções de layout e do menu.</span>
          </div>
          <button
            type="button"
            className="pwa-update-banner-dismiss"
            aria-label="Fechar"
            onClick={() => dismissForSession()}
          >
            <X size={20} />
          </button>
        </div>
        <div className="pwa-update-banner-actions">
          <button type="button" className="pwa-update-banner-secondary" onClick={() => dismissForSession()}>
            Depois
          </button>
          <button type="button" className="pwa-update-banner-cta" disabled={applying} onClick={() => runUpdate()}>
            {applying ? "Atualizando…" : "Atualizar agora"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
