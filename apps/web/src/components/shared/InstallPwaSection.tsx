import { Download, Share } from "lucide-react";
import { usePwaInstall } from "../../lib/pwa-install";

export function InstallPwaSection() {
  const { canInstall, iosHint, installing, promptInstall, showSection } = usePwaInstall();

  if (!showSection) return null;

  return (
    <section
      className="grid w-full max-w-lg gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left sm:p-6"
      aria-labelledby="pwa-install-heading"
    >
      <div className="grid gap-2">
        <span className="ui-eyebrow">Instalar no celular</span>
        <h2 id="pwa-install-heading" className="m-0 text-lg font-bold sm:text-xl">
          Versão web instalável (PWA)
        </h2>
        <p className="m-0 text-sm leading-relaxed text-brand-silver sm:text-base">
          Adicione o ATLLY à tela inicial para abrir em tela cheia, como um app — sem passar pela loja.
        </p>
      </div>

      {canInstall ? (
        <button
          type="button"
          className="ui-btn-primary inline-flex w-full items-center justify-center gap-2 sm:w-auto"
          disabled={installing}
          onClick={() => void promptInstall()}
        >
          <Download size={18} aria-hidden="true" />
          {installing ? "Abrindo instalação…" : "Instalar ATLLY"}
        </button>
      ) : null}

      {iosHint ? (
        <ol className="m-0 grid list-none gap-2 pl-0 text-sm leading-relaxed text-brand-silver">
          <li className="flex gap-2">
            <Share size={18} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
            <span>
              No Safari, toque em <strong className="text-white">Compartilhar</strong> e depois em{" "}
              <strong className="text-white">Adicionar à Tela de Início</strong>.
            </span>
          </li>
        </ol>
      ) : null}

      {!canInstall && !iosHint ? (
        <p className="m-0 text-sm text-brand-silver">
          Abra esta página no Chrome ou Edge no Android para ver o botão de instalação.
        </p>
      ) : null}
    </section>
  );
}
