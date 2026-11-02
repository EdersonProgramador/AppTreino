import { Download, Smartphone, X } from "lucide-react";
import { useState } from "react";
import {
  canOfferPwaInstall,
  canShowPwaInstallHelp,
  dismissPwaBanner,
  isPwaBannerDismissed,
  usePwaInstall
} from "../../lib/pwa-install";
import { InstallPwaInstructions } from "./InstallPwaInstructions";

export function InstallPwaBanner() {
  const pwa = usePwaInstall();
  const [visible, setVisible] = useState(() => !isPwaBannerDismissed());
  const [expanded, setExpanded] = useState(false);

  if (!canShowPwaInstallHelp() || !canOfferPwaInstall() || !visible) return null;

  function close(dismiss: boolean) {
    if (dismiss) dismissPwaBanner();
    setVisible(false);
    setExpanded(false);
  }

  const summary = pwa.iosInApp
    ? "Abra no Safari (saiu do Instagram/WhatsApp?) — depois Adicionar à Tela de Início."
    : pwa.iosDevice
      ? "iPhone: use o Safari → Compartilhar → Adicionar à Tela de Início."
      : "Atalho na tela inicial, em tela cheia — sem loja de apps.";

  if (expanded) {
    return (
      <div className="student-pwa-install-banner is-expanded" role="dialog" aria-label="Como instalar o ATLLY">
        <InstallPwaInstructions
          compact
          hints={pwa}
          onInstall={() => void pwa.promptInstall()}
          onClose={() => setExpanded(false)}
        />
        <button
          type="button"
          className="student-pwa-install-banner-dismiss-expanded"
          onClick={() => close(true)}
        >
          Não mostrar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="student-pwa-install-banner" role="region" aria-label="Instalar ATLLY no celular">
      <Smartphone size={20} className="student-pwa-install-banner-icon" aria-hidden="true" />
      <div className="student-pwa-install-banner-copy">
        <strong>Instale o ATLLY no celular</strong>
        <span>{summary}</span>
      </div>
      <div className="student-pwa-install-banner-actions">
        {pwa.canInstall ? (
          <button
            type="button"
            className="student-pwa-install-banner-cta"
            disabled={pwa.installing}
            onClick={() => void pwa.promptInstall()}
          >
            <Download size={16} aria-hidden="true" />
            {pwa.installing ? "…" : "Instalar"}
          </button>
        ) : (
          <button type="button" className="student-pwa-install-banner-cta" onClick={() => setExpanded(true)}>
            Passo a passo
          </button>
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
