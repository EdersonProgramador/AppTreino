import { RefreshCw, X } from "lucide-react";
import { usePwaUpdateStore } from "../../stores/pwaUpdateStore";

export function PwaUpdateBanner() {
  const visible = usePwaUpdateStore((s) => s.visible);
  const applying = usePwaUpdateStore((s) => s.applying);
  const runUpdate = usePwaUpdateStore((s) => s.runUpdate);
  const dismissForSession = usePwaUpdateStore((s) => s.dismissForSession);

  if (!visible) return null;

  return (
    <div className="pwa-update-banner" role="alertdialog" aria-labelledby="pwa-update-title" aria-modal="false">
      <div className="pwa-update-banner-inner">
        <RefreshCw size={20} className="pwa-update-banner-icon" aria-hidden="true" />
        <div className="pwa-update-banner-copy">
          <strong id="pwa-update-title">Nova versão disponível</strong>
          <span>Toque em atualizar para ver as últimas melhorias (menu, layout, correções).</span>
        </div>
        <div className="pwa-update-banner-actions">
          <button type="button" className="pwa-update-banner-cta" disabled={applying} onClick={() => runUpdate()}>
            {applying ? "Atualizando…" : "Atualizar agora"}
          </button>
          <button
            type="button"
            className="pwa-update-banner-dismiss"
            aria-label="Depois"
            onClick={() => dismissForSession()}
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
