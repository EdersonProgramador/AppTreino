import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { FaApple, FaGooglePlay } from "react-icons/fa";
import { assetUrl } from "../../lib/urls";
import { brand } from "../../lib/brand";
import { paths } from "../../auth/paths";
import { appStoreUrls, hasPublishedStoreListing } from "../../lib/app-store";

function StoreListingCard({
  platform,
  href,
  icon,
  iconClass,
  labelSmall,
  labelStrong
}: {
  platform: "Google Play" | "App Store";
  href: string | null;
  icon: ReactNode;
  iconClass: string;
  labelSmall: string;
  labelStrong: string;
}) {
  const soon = !href;
  const aria = soon ? `${platform} — em breve` : `Baixar na ${platform}`;

  const inner = (
    <>
      <span className={`app-store-icon ${iconClass}`} aria-hidden="true">
        {icon}
      </span>
      <span className="grid min-w-0 gap-0.5 text-left">
        <small>{labelSmall}</small>
        <strong>{labelStrong}</strong>
      </span>
    </>
  );

  if (href) {
    return (
      <a
        className="app-store-card no-underline transition-opacity hover:opacity-90"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={aria}
      >
        {inner}
      </a>
    );
  }

  return (
    <div className="app-store-card opacity-80" aria-label={aria}>
      {inner}
    </div>
  );
}

export function AppDownloadSoonView() {
  const live = hasPublishedStoreListing();

  return (
    <main className="app-download-soon home-command min-h-screen">
      <header className="guest-chrome sticky top-0 z-20 flex min-h-[72px] items-center justify-between gap-4 border-b px-5 backdrop-blur-md sm:px-8 md:px-12">
        <Link className="inline-flex min-w-0 flex-col no-underline" to={paths.home} aria-label="Ir para início">
          <img
            className="block h-auto w-[clamp(140px,14vw,190px)]"
            src={assetUrl("assets/atlly-logo.png")}
            alt={brand.name}
          />
          <span className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.18em] text-brand-silver">
            {brand.category}
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link className="guest-chrome-link text-sm font-bold no-underline" to={paths.login}>
            Entrar
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-3xl place-items-center gap-8 px-5 py-16 text-center sm:px-8 md:py-24">
        <span className="ui-eyebrow">Aplicativo mobile</span>
        <div className="grid gap-4">
          <h1 className="ui-display m-0 text-[clamp(2rem,5vw,3.4rem)] leading-tight">
            {live ? "Baixe o app ATLLY" : "Em breve nas lojas"}
          </h1>
          <p className="app-download-copy m-0 mx-auto max-w-xl text-base leading-relaxed sm:text-lg">
            {live ? (
              <>
                Instale o {brand.name} no seu celular. Treino, corrida, performance e comunidade — com a mesma conta da
                web.
              </>
            ) : (
              <>
                O {brand.name} estará disponível em breve no Google Play e na App Store. Enquanto isso, você já pode
                criar sua conta e treinar pela versão web.
              </>
            )}
          </p>
        </div>

        <div className="grid w-full max-w-lg gap-3 sm:grid-cols-2">
          <StoreListingCard
            platform="Google Play"
            href={appStoreUrls.android}
            icon={<FaGooglePlay size={28} />}
            iconClass="app-store-icon-play"
            labelSmall={appStoreUrls.android ? "Disponível no" : "Em breve no"}
            labelStrong="Google Play"
          />
          <StoreListingCard
            platform="App Store"
            href={appStoreUrls.ios}
            icon={<FaApple size={30} />}
            iconClass="app-store-icon-apple"
            labelSmall={appStoreUrls.ios ? "Disponível na" : "Em breve na"}
            labelStrong="App Store"
          />
        </div>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link className="ui-btn-primary no-underline" to={paths.activate}>
            Criar conta / Entrar
          </Link>
          <Link className="ui-btn-secondary no-underline" to={paths.home}>
            <ArrowLeft size={18} />
            Voltar para o início
          </Link>
        </div>
      </section>
    </main>
  );
}
