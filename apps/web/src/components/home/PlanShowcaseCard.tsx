import { ArrowRight, Check, Sparkles } from "lucide-react";
import { formatPlanPriceLines, type CatalogPlan } from "../../lib/plan-catalog";

type PlanShowcaseCardProps = {
  plan: CatalogPlan;
  monthlyBaseline: CatalogPlan | null;
  onActivate: () => void;
};

function isCoachTier(plan: CatalogPlan): boolean {
  const haystack = `${plan.code} ${plan.name}`.toLowerCase();
  return haystack.includes("coach");
}

export function PlanShowcaseCard({ plan, monthlyBaseline, onActivate }: PlanShowcaseCardProps) {
  const priceLines = formatPlanPriceLines(plan, monthlyBaseline);
  const benefits = plan.cardBenefits.length > 0 ? plan.cardBenefits : ["Acesso completo ao ecossistema ATLLY"];
  const featured = plan.isFeatured || Boolean(plan.badgeLabel);
  const coachTier = isCoachTier(plan);

  return (
    <article
      className={`home-plan-showcase-card${featured ? " is-featured" : ""}${coachTier ? " is-coach" : ""}`}
    >
      <div className="home-plan-showcase-card__glow" aria-hidden="true" />
      <div className="home-plan-showcase-card__scan" aria-hidden="true" />

      {plan.badgeLabel ? <span className="home-plan-showcase-card__badge">{plan.badgeLabel}</span> : null}

      <header className="home-plan-showcase-card__head">
        <div>
          {coachTier ? (
            <span className="home-plan-showcase-card__eyebrow">
              <Sparkles size={12} />
              Orientação inteligente
            </span>
          ) : featured ? (
            <span className="home-plan-showcase-card__eyebrow home-plan-showcase-card__eyebrow--gold">Performance completa</span>
          ) : (
            <span className="home-plan-showcase-card__eyebrow">Entrada ATLLY</span>
          )}
          <h3 className="home-plan-showcase-card__title">{plan.name}</h3>
          {plan.description ? <p className="home-plan-showcase-card__subtitle">{plan.description}</p> : null}
        </div>
      </header>

      <div className="home-plan-showcase-card__price">
        {priceLines.anchor ? <span className="home-plan-showcase-card__anchor">{priceLines.anchor}</span> : null}
        <div className="home-plan-showcase-card__price-main">
          <strong className="home-plan-showcase-card__amount">{priceLines.primary}</strong>
          <span className="home-plan-showcase-card__cycle">{priceLines.secondary}</span>
        </div>
        {priceLines.discountLabel ? (
          <span className="home-plan-showcase-card__discount">{priceLines.discountLabel}</span>
        ) : null}
      </div>

      <ul className="home-plan-showcase-card__perks">
        {benefits.map((perk) => (
          <li key={perk}>
            <Check size={15} aria-hidden="true" />
            <span>{perk}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={`home-plan-showcase-card__cta${featured ? " is-primary" : coachTier ? " is-coach" : ""}`}
        onClick={onActivate}
      >
        Ativar {plan.name}
        <ArrowRight size={17} />
      </button>
    </article>
  );
}
