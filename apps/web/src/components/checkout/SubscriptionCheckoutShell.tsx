import { Link } from "react-router-dom";
import { LogOut } from "lucide-react";
import { brand } from "../../lib/brand";
import { assetUrl } from "../../lib/urls";
import { paths } from "../../auth/paths";

type SubscriptionCheckoutShellProps = {
  children: React.ReactNode;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  onLogout?: () => void;
  backHref?: string;
  backLabel?: string;
};

export function SubscriptionCheckoutShell({
  children,
  eyebrow = brand.areaEyebrow,
  title = "Ative seu sistema",
  subtitle = brand.commandLine,
  onLogout,
  backHref = paths.home,
  backLabel = "Voltar ao site"
}: SubscriptionCheckoutShellProps) {
  return (
    <main
      className="activate-page home-command"
      style={{ ["--activate-bg" as string]: `url(${assetUrl("assets/atlly-activate-bg.png")})` }}
    >
      <div className="activate-page__media" aria-hidden="true" />
      <div className="activate-page__veil" aria-hidden="true" />
      <div className="activate-page__scan" aria-hidden="true" />

      <div className="activate-page-shell">
        <header className="activate-page-header">
          <Link to={paths.home} className="activate-page-brand" aria-label={brand.name}>
            <img src={assetUrl("assets/atlly-logo.png")} alt="" />
            <span>{brand.category}</span>
          </Link>
          <div className="activate-page-header__actions">
            <Link className="activate-page-link" to={backHref}>
              {backLabel}
            </Link>
            {onLogout ? (
              <button type="button" className="activate-page-link" onClick={onLogout}>
                <LogOut size={16} />
                Sair
              </button>
            ) : null}
          </div>
        </header>

        <div className="activate-page-hero-band" aria-hidden="true" />

        <div className="activate-page-grid">
          <section className="activate-page-story">
            <span className="home-telemetry-label">{eyebrow}</span>
            <h1 className="activate-page-story__title">{title}</h1>
            <p className="activate-page-story__copy">{subtitle}</p>
            <ul className="activate-page-story__list">
              <li>Treinos digitais com histórico de cargas e evolução.</li>
              <li>Corrida, caminhada e ciclismo integrados ao seu perfil.</li>
              <li>{brand.aiCoach} para orientação tática no dia a dia.</li>
              <li>Comunidade, desafios e métricas de performance.</li>
            </ul>
          </section>

          <section className="activate-page-panel-wrap">{children}</section>
        </div>
      </div>
    </main>
  );
}
