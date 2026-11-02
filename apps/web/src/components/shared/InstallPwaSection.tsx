import { canOfferPwaInstall, usePwaInstall } from "../../lib/pwa-install";
import { InstallPwaInstructions } from "./InstallPwaInstructions";

export function InstallPwaSection() {
  const pwa = usePwaInstall();

  if (!canOfferPwaInstall()) return null;

  return (
    <section
      className="install-pwa-section grid w-full max-w-lg gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left sm:p-6"
      aria-label="Versão web instalável no celular"
    >
      <span className="ui-eyebrow">Instalar no celular</span>
      <InstallPwaInstructions
        hints={pwa}
        onInstall={() => void pwa.promptInstall()}
      />
    </section>
  );
}
