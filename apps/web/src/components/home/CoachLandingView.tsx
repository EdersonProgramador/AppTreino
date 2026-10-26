import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronRight, Menu, X, XCircle } from "lucide-react";
import { formatPriceInBRL } from "@app-treino/shared";
import { brand } from "../../lib/brand";
import { paths } from "../../auth/paths";
import { assetUrl } from "../../lib/urls";
import {
  coachBenefits,
  coachCommissionBullets,
  coachFaq,
  coachHeroTrust,
  coachHowItWorks,
  coachLandingNav,
  coachManagedExcluded,
  coachManagedIncluded,
  coachProPriceCents,
  coachProPricingBullets,
  coachStudioSteps
} from "../../lib/coach-landing-content";

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block text-xs font-extrabold uppercase tracking-[0.16em] text-brand-gold">{children}</span>
  );
}

function AtllyLogo({ className = "h-9 w-auto" }: { className?: string }) {
  return <img src={assetUrl("assets/atlly-logo.png")} alt={brand.name} className={className} />;
}

type Props = {
  onSubscribe: () => void;
  onLogin: () => void;
};

export function CoachLandingView({ onSubscribe, onLogin }: Props) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const priceLabel = formatPriceInBRL(coachProPriceCents);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (media.matches) setMobileNavOpen(false);
    };
    closeOnDesktop();
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    document.title = `Coach Pro · ${brand.name}`;
    return () => {
      document.title = brand.name;
    };
  }, []);

  return (
    <main
      id="topo"
      ref={scrollRootRef}
      className="home-landing home-command coach-landing coach-landing--pro text-sand"
    >
      <div className="home-topbar border-b border-brand-gold/30 bg-gradient-to-r from-black via-[#1a1208] to-black px-4 py-2.5 text-center">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-brand-gold sm:text-xs">
          Coach Pro · plano anual exclusivo para profissionais
        </p>
        <p className="mt-0.5 text-[11px] text-brand-silver sm:text-xs">
          {priceLabel}/ano · treinos exclusivos para seus alunos · comissão de indicação 8%.{" "}
          <button type="button" className="font-bold text-brand-amber underline-offset-2 hover:underline" onClick={onSubscribe}>
            Assinar Coach Pro
          </button>
        </p>
      </div>

      <header className="home-header sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[64px] max-w-6xl items-center justify-between gap-3 px-4 sm:min-h-[72px] sm:px-8">
          <a href="#topo" className="flex min-w-0 flex-col no-underline" aria-label={`${brand.name} Coach Pro`}>
            <AtllyLogo className="h-8 w-auto max-w-[140px] sm:h-9 sm:max-w-[160px]" />
            <span className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.16em] text-brand-silver sm:tracking-[0.22em]">
              Coach Pro
            </span>
          </a>
          <nav className="hidden items-center gap-4 xl:flex" aria-label="Navegação coach">
            {coachLandingNav.map((item) => (
              <a key={item.href} href={item.href} className="text-sm font-bold text-brand-silver transition hover:text-brand-gold">
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link to={paths.home} className="hidden text-sm font-bold text-brand-silver no-underline transition hover:text-brand-gold md:inline-flex">
              Site ATLLY
            </Link>
            <button type="button" className="hidden text-sm font-bold text-brand-silver transition hover:text-brand-gold sm:inline-flex" onClick={onLogin}>
              Entrar
            </button>
            <button type="button" className="ui-btn-primary !min-h-10 !px-3 !text-xs sm:!min-h-11 sm:!px-5 sm:!text-sm" onClick={onSubscribe}>
              Assinar Coach Pro
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-sand xl:hidden"
              aria-label={mobileNavOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((value) => !value)}
            >
              {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        {mobileNavOpen ? (
          <nav className="home-mobile-nav border-t border-white/10 px-4 py-4 xl:hidden" aria-label="Navegação mobile coach">
            <div className="mx-auto grid max-w-6xl gap-1">
              {coachLandingNav.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-3 text-sm font-bold text-brand-silver transition hover:bg-white/5 hover:text-brand-gold"
                  onClick={() => setMobileNavOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <Link to={paths.home} className="rounded-lg px-3 py-3 text-sm font-bold text-brand-silver no-underline hover:bg-white/5" onClick={() => setMobileNavOpen(false)}>
                Site ATLLY
              </Link>
              <button type="button" className="rounded-lg px-3 py-3 text-left text-sm font-bold text-brand-silver hover:bg-white/5" onClick={() => { setMobileNavOpen(false); onLogin(); }}>
                Entrar
              </button>
            </div>
          </nav>
        ) : null}
      </header>

      <section className="coach-landing-hero relative overflow-hidden px-4 py-20 sm:px-8 sm:py-24">
        <div className="coach-landing-hero__glow pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative z-10 mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="animate-fade-up max-w-2xl">
            <SectionEyebrow>Somente para coaches</SectionEyebrow>
            <h1 className="home-brand-signal mt-6 text-[clamp(2.2rem,6vw,3.75rem)] leading-[0.95]">
              Sua operação profissional
              <span className="mt-2 block text-[0.72em] tracking-[0.06em] text-brand-gold">na ATLLY.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg font-semibold text-brand-silver">
              Coach Pro reúne painel, estúdio e agenda para você prescrever treinos exclusivos — cada aluno segue só a rotina que
              você publicou.
            </p>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-sand-muted">
              Para quem conduz a rotina de outros atletas: cadastre alunos, monte programas, marque sessões e acompanhe a execução.
              Sua metodologia, entregue em um só lugar.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="button" className="ui-btn-primary shadow-glow" onClick={onSubscribe}>
                Assinar Coach Pro — {priceLabel}/ano
                <ArrowRight size={18} />
              </button>
              <button type="button" className="inline-flex items-center gap-2 text-sm font-extrabold text-brand-silver transition hover:text-brand-gold" onClick={onLogin}>
                Já tenho conta — entrar no /coach
                <ChevronRight size={18} />
              </button>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-sand-faint">
              {coachHeroTrust.map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <Check size={13} className="text-brand-gold" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <article
            id="plano"
            className="coach-pro-pricing-card home-plan-featured animate-fade-up scroll-mt-28 rounded-3xl border border-brand-gold/35 p-6 sm:p-8"
            style={{ animationDelay: "100ms" }}
          >
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-gold">Plano anual</p>
            <h2 className="mt-2 font-display text-3xl font-bold uppercase tracking-tight text-sand">Coach Pro</h2>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-4xl font-extrabold text-brand-gold">{priceLabel}</span>
              <span className="text-sm font-bold text-sand-muted">/ ano</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-sand-muted">
              Pagamento anual. Ferramentas profissionais e cadastro de alunos vinculados a você — treinos exclusivos do coach, sem
              plano contratado pelo próprio aluno.
            </p>
            <ul className="mt-5 grid gap-2.5 border-t border-white/10 pt-5">
              {coachProPricingBullets.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm text-sand-muted">
                  <Check size={16} className="mt-0.5 shrink-0 text-brand-gold" />
                  {item}
                </li>
              ))}
            </ul>
            <button type="button" className="ui-btn-primary mt-6 w-full shadow-glow" onClick={onSubscribe}>
              Contratar Coach Pro
              <ArrowRight size={18} />
            </button>
            <p className="mt-4 text-center text-[11px] leading-relaxed text-sand-faint">
              Após o pagamento, solicite ao admin ATLLY a promoção COACH na sua organização parceira.
            </p>
          </article>
        </div>
      </section>

      <section id="beneficios" className="home-band border-y border-white/10 px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionEyebrow>Benefícios</SectionEyebrow>
          <h2 className="ui-display mt-4 max-w-3xl text-[clamp(1.75rem,4vw,2.5rem)] font-bold uppercase">
            Tudo que um coach precisa em um só lugar
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {coachBenefits.map((item) => (
              <article key={item.title} className="home-panel rounded-2xl border border-white/10 p-5">
                <item.icon className="text-brand-gold" size={22} />
                <h3 className="mt-3 font-bold text-sand">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sand-muted">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="alunos" className="px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionEyebrow>Seus alunos</SectionEyebrow>
          <h2 className="ui-display mt-4 max-w-3xl text-[clamp(1.75rem,4vw,2.25rem)] font-bold uppercase">
            Treinos exclusivos do coach
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-sand-muted">
            Você cadastra no painel e define o que cada aluno vê: programas, agenda e acompanhamento. Nada de catálogo aberto — a
            jornada é fechada à sua prescrição profissional.
          </p>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <article className="home-panel rounded-3xl border border-brand-gold/25 p-6">
              <h3 className="flex items-center gap-2 font-display text-lg font-bold uppercase text-brand-gold">
                <Check size={20} />
                Incluído para o aluno
              </h3>
              <ul className="mt-5 grid gap-3">
                {coachManagedIncluded.map((item) => (
                  <li key={item} className="flex gap-3 text-sm text-sand-muted">
                    <Check size={16} className="mt-0.5 shrink-0 text-brand-gold" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
            <article className="home-panel rounded-3xl border border-white/10 p-6">
              <h3 className="flex items-center gap-2 font-display text-lg font-bold uppercase text-sand">
                <XCircle size={20} className="text-brand-telemetry-soft" />
                Fechado no cadastro
              </h3>
              <ul className="mt-5 grid gap-3">
                {coachManagedExcluded.map((item) => (
                  <li key={item} className="flex gap-3 text-sm text-sand-muted">
                    <XCircle size={16} className="mt-0.5 shrink-0 text-brand-telemetry-soft/90" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section id="estudio" className="home-band border-y border-white/10 px-4 py-16 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionEyebrow>Estúdio de Treinos</SectionEyebrow>
            <h2 className="ui-display mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-bold uppercase">
              Do exercício ao treino na agenda
            </h2>
            <p className="mt-4 text-base leading-relaxed text-sand-muted">
              Produza conteúdo, publique programas e combine com a agenda — o fluxo pensado para coaches que operam dezenas de
              alunos.
            </p>
            <ul className="mt-6 grid gap-3">
              {coachStudioSteps.map((step) => (
                <li key={step} className="flex gap-3 text-sm text-sand-muted">
                  <Check size={16} className="mt-0.5 shrink-0 text-brand-gold" />
                  {step}
                </li>
              ))}
            </ul>
          </div>
          <article className="home-panel rounded-3xl border border-white/10 p-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-telemetry-soft">Fluxo</p>
            <div className="mt-4 grid gap-3">
              {["Exercícios", "Divisões", "Programas", "Agenda", "Aluno"].map((label, index) => (
                <div key={label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-gold/15 text-xs font-extrabold text-brand-gold">
                    {index + 1}
                  </span>
                  <strong className="text-sm text-sand">{label}</strong>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section id="comissao" className="px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionEyebrow>Receitas extras</SectionEyebrow>
          <h2 className="ui-display mt-4 max-w-3xl text-[clamp(1.75rem,4vw,2.25rem)] font-bold uppercase">
            Indicações com 8% de comissão
          </h2>
          <p className="mt-4 max-w-2xl text-sm text-sand-muted">
            Além da operação com seus alunos, compartilhe seu código de indicação e receba comissão sobre pagamentos confirmados.
          </p>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <ul className="grid gap-3">
              {coachCommissionBullets.map((item) => (
                <li key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-sand-muted">
                  <Check size={16} className="mt-0.5 shrink-0 text-brand-gold" />
                  {item}
                </li>
              ))}
            </ul>
            <article className="home-panel rounded-3xl border border-brand-gold/25 p-6">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-gold">Exemplo</p>
              <p className="mt-3 text-sm text-sand-muted">
                Aluno indicado paga R$ 99/mês → você recebe <strong className="text-sand">R$ 7,92</strong> por pagamento confirmado,
                após carência de 14 dias, com Coach Pro e papel de coach ativos.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="home-band border-y border-white/10 px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionEyebrow>Como funciona</SectionEyebrow>
          <h2 className="ui-display mt-4 max-w-2xl text-[clamp(1.75rem,4vw,2.25rem)] font-bold uppercase">
            Três passos para operar como coach
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {coachHowItWorks.map((item) => (
              <article key={item.step} className="home-panel rounded-2xl border border-white/10 p-5">
                <span className="text-xs font-extrabold tracking-[0.2em] text-brand-gold">{item.step}</span>
                <h3 className="mt-3 font-display text-xl font-bold text-sand">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sand-muted">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-cta-band mx-4 mb-8 rounded-3xl px-6 py-12 sm:mx-8 sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="home-cta-title font-display text-[clamp(1.5rem,3vw,2rem)] font-bold uppercase">
              Pronto para o Coach Pro?
            </p>
            <p className="home-cta-copy mt-3 text-base text-sand-muted">
              Contrate o plano anual, peça a promoção na organização e comece a cadastrar seus alunos hoje.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" className="ui-btn-primary shadow-glow" onClick={onSubscribe}>
              Assinar Coach Pro
              <ArrowRight size={18} />
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/15 px-5 text-sm font-extrabold text-sand transition hover:border-brand-gold/40"
              onClick={onLogin}
            >
              Entrar no painel
            </button>
          </div>
        </div>
      </section>

      <section id="faq" className="px-4 pb-20 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <SectionEyebrow>FAQ Coach Pro</SectionEyebrow>
          <h2 className="ui-display mt-4 text-[clamp(1.5rem,3vw,2rem)] font-bold uppercase">Dúvidas frequentes</h2>
          <div className="mt-8 grid gap-4">
            {coachFaq.map((item) => (
              <article key={item.question} className="home-panel rounded-2xl border border-white/10 p-5">
                <h3 className="font-bold text-sand">{item.question}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sand-muted">{item.answer}</p>
              </article>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-sand-faint">
            Landing exclusiva para coaches:{" "}
            <Link to={paths.coachLanding} className="font-bold text-brand-gold no-underline hover:underline">
              atlly.com.br{paths.coachLanding}
            </Link>
            {" · "}
            <Link to={paths.home} className="font-bold text-brand-silver no-underline hover:text-brand-gold">
              Site geral ATLLY
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
