import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { FaApple, FaGooglePlay } from "react-icons/fa";
import { assetUrl } from "../../lib/urls";
import { paths } from "../../auth/paths";
import { ThemeModeSwitch } from "../shared/ThemeModeSwitch";

export function AppDownloadSoonView() {
  return (
    <main className="app-download-soon min-h-screen">
      <header className="guest-chrome sticky top-0 z-20 flex min-h-[72px] items-center justify-between gap-4 border-b px-5 backdrop-blur-md sm:px-8 md:px-12">
        <Link className="inline-flex items-center border-0 bg-transparent p-0" to={paths.home} aria-label="Ir para início">
          <img
            className="block h-auto w-[clamp(140px,14vw,190px)]"
            src={assetUrl("assets/app-treino-logo.svg")}
            alt="App Treino"
          />
        </Link>
        <div className="flex items-center gap-3">
          <ThemeModeSwitch compact />
          <Link className="guest-chrome-link text-sm font-bold no-underline" to={paths.login}>
            Entrar
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-3xl place-items-center gap-8 px-5 py-16 text-center sm:px-8 md:py-24">
        <span className="ui-eyebrow">Aplicativo mobile</span>
        <div className="grid gap-4">
          <h1 className="ui-display m-0 text-[clamp(2rem,5vw,3.4rem)] leading-tight">Em breve nas lojas</h1>
          <p className="app-download-copy m-0 mx-auto max-w-xl text-base leading-relaxed sm:text-lg">
            O App Treino estará disponível em breve no Google Play e na App Store. Enquanto isso, você já pode criar sua
            conta e treinar pela versão web.
          </p>
        </div>

        <div className="grid w-full max-w-lg gap-3 sm:grid-cols-2">
          <div className="app-store-card" aria-label="Google Play — em breve">
            <span className="app-store-icon app-store-icon-play" aria-hidden="true">
              <FaGooglePlay size={28} />
            </span>
            <span className="grid min-w-0 gap-0.5 text-left">
              <small>Em breve no</small>
              <strong>Google Play</strong>
            </span>
          </div>
          <div className="app-store-card" aria-label="App Store — em breve">
            <span className="app-store-icon app-store-icon-apple" aria-hidden="true">
              <FaApple size={30} />
            </span>
            <span className="grid min-w-0 gap-0.5 text-left">
              <small>Em breve na</small>
              <strong>App Store</strong>
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link className="ui-btn-primary no-underline" to={paths.login}>
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
