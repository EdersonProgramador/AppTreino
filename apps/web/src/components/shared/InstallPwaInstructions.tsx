import { Download, ExternalLink, Share, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import { isNativeAppShell, type PwaInstallHints } from "../../lib/pwa-install";

type Props = {
  hints: Pick<PwaInstallHints, "canInstall" | "iosDevice" | "iosInApp" | "iosSafari" | "installing">;
  onInstall?: () => void;
  onClose?: () => void;
  compact?: boolean;
  /** Página /baixar-app: mostra iPhone e Android juntos. */
  showBothPlatforms?: boolean;
};

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="install-pwa-step">
      <span className="install-pwa-step-num" aria-hidden="true">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function IosInstallBlock({
  iosInApp,
  iosSafari
}: Pick<PwaInstallHints, "iosInApp" | "iosSafari">) {
  return (
    <section className="install-pwa-platform" aria-labelledby="install-pwa-ios-heading">
      <h4 id="install-pwa-ios-heading">iPhone (iOS)</h4>
      <p className="install-pwa-platform-note">
        No iPhone, o jeito mais confiável é instalar pelo <strong>Safari</strong>. Outros browsers usam o mesmo motor,
        mas o ícone na tela inicial funciona melhor quando você adiciona pelo Safari.
      </p>
      <ol className="install-pwa-steps">
        {iosInApp ? (
          <Step n={1}>
            Você abriu o site dentro de outro app (Instagram, WhatsApp, etc.). Toque em{" "}
            <strong>Abrir no Safari</strong> ou <strong>Abrir no navegador</strong>. Se não aparecer, copie o link e cole
            no Safari.
          </Step>
        ) : null}
        <Step n={iosInApp ? 2 : 1}>
          Abra <strong>atlly.com.br</strong> no app <strong>Safari</strong> (não só no Chrome, se puder escolher).
        </Step>
        <Step n={iosInApp ? 3 : 2}>
          Toque em <Share size={16} className="inline align-text-bottom text-emerald-400" aria-hidden="true" />{" "}
          <strong>Compartilhar</strong> (barra inferior do Safari).
        </Step>
        <Step n={iosInApp ? 4 : 3}>
          Role e escolha <strong>Adicionar à Tela de Início</strong> → <strong>Adicionar</strong>.
        </Step>
        <Step n={iosInApp ? 5 : 4}>
          Abra pelo ícone na tela inicial. Pronto — funciona como app, em tela cheia.
        </Step>
      </ol>
      {!iosSafari && !iosInApp ? (
        <p className="install-pwa-platform-tip">
          <ExternalLink size={16} aria-hidden="true" /> Está no Chrome ou outro browser? Copie a URL e abra no{" "}
          <strong>Safari</strong> antes de adicionar à tela inicial.
        </p>
      ) : null}
    </section>
  );
}

function AndroidInstallBlock() {
  return (
    <section className="install-pwa-platform" aria-labelledby="install-pwa-android-heading">
      <h4 id="install-pwa-android-heading">Android</h4>
      <ol className="install-pwa-steps">
        <Step n={1}>
          Abra <strong>atlly.com.br</strong> no <strong>Chrome</strong> ou <strong>Edge</strong>.
        </Step>
        <Step n={2}>
          Toque em <strong>Instalar</strong> nesta página ou no menu do browser → <strong>Instalar app</strong> /{" "}
          <strong>Adicionar à tela inicial</strong>.
        </Step>
        <Step n={3}>Confirme e abra pelo ícone na gaveta de apps ou na tela inicial.</Step>
      </ol>
    </section>
  );
}

export function InstallPwaInstructions({ hints, onInstall, onClose, compact, showBothPlatforms }: Props) {
  const { canInstall, iosDevice, iosInApp, iosSafari, installing } = hints;

  return (
    <div className={`install-pwa-instructions${compact ? " is-compact" : ""}`}>
      <div className="install-pwa-instructions-head">
        <Smartphone size={22} className="install-pwa-instructions-icon" aria-hidden="true" />
        <div>
          <h3 className="install-pwa-instructions-title">Instalar ATLLY no celular</h3>
          <p className="install-pwa-instructions-lead">
            Atalho na tela inicial, em tela cheia — sem loja de apps. Use a mesma conta da web.
          </p>
        </div>
        {onClose ? (
          <button type="button" className="install-pwa-instructions-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        ) : null}
      </div>

      {isNativeAppShell() ? (
        <p className="install-pwa-platform-note">
          Você está dentro do app ATLLY. Para instalar a <strong>versão web</strong> na tela inicial, abra{" "}
          <strong>atlly.com.br</strong> no <strong>Safari</strong> (iPhone) ou <strong>Chrome</strong> (Android) — sem o
          parâmetro do app embutido.
        </p>
      ) : null}

      {canInstall ? (
        <button
          type="button"
          className="ui-btn-primary inline-flex w-full items-center justify-center gap-2 sm:w-auto"
          disabled={installing}
          onClick={() => onInstall?.()}
        >
          <Download size={18} aria-hidden="true" />
          {installing ? "Abrindo instalação…" : "Instalar ATLLY"}
        </button>
      ) : null}

      {showBothPlatforms ? (
        <>
          <IosInstallBlock iosInApp={iosInApp} iosSafari={iosSafari} />
          <AndroidInstallBlock />
        </>
      ) : iosDevice ? (
        <IosInstallBlock iosInApp={iosInApp} iosSafari={iosSafari} />
      ) : (
        <AndroidInstallBlock />
      )}

      {!compact ? (
        <p className="install-pwa-footnote">
          Precisa de GPS em segundo plano ou app nas lojas? Veja também Google Play e App Store nesta página.
        </p>
      ) : null}
    </div>
  );
}
