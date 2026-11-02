import { Download, Smartphone, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { paths } from "../../auth/paths";
import {
  canOfferPwaInstall,
  dismissPwaBanner,
  isPwaBannerDismissed,
  usePwaInstall
} from "../../lib/pwa-install";

export function InstallPwaBanner() {
  const { canInstall, iosHint, installing, promptInstall } = usePwaInstall();
  const [visible, setVisible] = useState(() => !isPwaBannerDismissed());

  if (!canOfferPwaInstall() || !visible) return null;

  function close(dismiss: boolean) {
    if (dismiss) dismissPwaBanner();
    setVisible(false);
  }

  return (
    <div className="student-pwa-install-banner" role="region" aria-label="Instalar ATLLY no celular">
      <Smartphone size={20} className="student-pwa-install-banner-icon" aria-hidden="true" />
      <div className="student-pwa-install-banner-copy">
        <strong>Instale o ATLLY no celular</strong>
        <span>
          {iosHint
            ? "Safari: Compartilhar → Adicionar à Tela de Início."
            : "Atalho na tela inicial, em tela cheia — sem loja de apps."}
        </span>
      </div>
      <div className="student-pwa-install-banner-actions">
        {canInstall ? (
          <button
            type="button"
            className="student-pwa-install-banner-cta"
            disabled={installing}
            onClick={() => void promptInstall()}
          >
            <Download size={16} aria-hidden="true" />
            {installing ? "…" : "Instalar"}
          </button>
        ) : (
          <Link className="student-pwa-install-banner-cta no-underline" to={paths.download}>
            Como instalar
          </Link>
        )}
        <button
          type="button"
          className="student-pwa-install-banner-dismiss"
          aria-label="Fechar aviso de instalação"
          onClick={() => close(true)}
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
