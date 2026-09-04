import { Check, Minus, ShieldCheck } from "lucide-react";
import { planComparisonMatrix } from "../../lib/home-content";
import type { CatalogPlan } from "../../lib/plan-catalog";
import { PlanShowcaseCard } from "./PlanShowcaseCard";

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <span className="home-telemetry-label">{children}</span>;
}

type HomePricingSectionProps = {
  plans: CatalogPlan[];
  loading: boolean;
  monthlyBaseline: CatalogPlan | null;
  onStart: (planCode?: string) => void;
};

export function HomePricingSection({ plans, loading, monthlyBaseline, onStart }: HomePricingSectionProps) {
  const showComparison = !loading && plans.length >= 2 && plans.length <= 4;

  return (
    <section id="planos" className="home-pricing-cinema">
      <div className="home-pricing-cinema__backdrop" aria-hidden="true">
        <div className="home-pricing-cinema__glow" />
        <div className="home-pricing-cinema__grid" />
        <div className="home-pricing-cinema__scan" />
      </div>

      <div className="home-pricing-cinema__content">
        <header className="home-pricing-cinema__head">
          <SectionEyebrow>Planos ATLLY</SectionEyebrow>
          <h2 className="home-pricing-cinema__title ui-display">
            Três níveis. Uma evolução.
            <span className="home-pricing-cinema__title-accent">Escolha seu comando.</span>
          </h2>
          <p className="home-pricing-cinema__copy">
            Do primeiro passo à performance completa — com orientação inteligente quando você quiser ir além.
            Acesso imediato após confirmação. Garantia de 7 dias.
          </p>
        </header>

        <div className="home-plan-showcase-grid">
          {loading ? (
            <article className="home-plan-showcase-card home-plan-showcase-card--loading">
              <p>Carregando planos…</p>
            </article>
          ) : plans.length > 0 ? (
            plans.map((plan) => (
              <PlanShowcaseCard
                key={plan.code}
                plan={plan}
                monthlyBaseline={monthlyBaseline}
                onActivate={() => onStart(plan.code)}
              />
            ))
          ) : (
            <article className="home-plan-showcase-card home-plan-showcase-card--loading">
              <p>Planos indisponíveis no momento.</p>
            </article>
          )}
        </div>

        {showComparison ? (
          <div className="home-plan-comparison">
            <div className="home-plan-comparison__head">
              <SectionEyebrow>Comparativo</SectionEyebrow>
              <h3 className="home-plan-comparison__title">O que muda em cada plano</h3>
            </div>
            <div className="home-plan-comparison__table-wrap">
              <table className="home-plan-comparison__table">
                <thead>
                  <tr>
                    <th scope="col">Recurso</th>
                    {plans.map((plan) => (
                      <th key={plan.code} scope="col">
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {planComparisonMatrix.map((row) => (
                    <tr key={row.feature}>
                      <th scope="row">{row.feature}</th>
                      {plans.map((plan, index) => {
                        const included = row.included[index] ?? false;
                        return (
                          <td key={`${row.feature}-${plan.code}`}>
                            {included ? (
                              <span className="home-plan-comparison__yes" aria-label="Incluído">
                                <Check size={16} />
                              </span>
                            ) : (
                              <span className="home-plan-comparison__no" aria-label="Não incluído">
                                <Minus size={16} />
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="home-pricing-trust">
          <div className="home-pricing-trust__icon" aria-hidden="true">
            <ShieldCheck size={24} />
          </div>
          <div>
            <strong>Garantia ATLLY · 7 dias</strong>
            <p>Experimente na sua rotina. Se não fizer sentido, cancele conforme as condições do plano.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
