import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Lock,
  Menu,
  ShieldCheck,
  Star,
  X,
  Zap
} from "lucide-react";
import { formatPriceInBRL, initialPlans } from "@app-treino/shared";
import { brand } from "../../lib/brand";
import { assetUrl } from "../../lib/urls";
import {
  annualPlanPerks,
  audienceSegments,
  faqItems,
  landingNav,
  monthlyPlanPerks,
  painSolutionRows,
  resources,
  socialProofMetrics,
  testimonials,
  workoutRows
} from "../../lib/home-content";
import { ThemeModeSwitch } from "../shared/ThemeModeSwitch";

export function HomeView({
  onStart,
  onDownloadApp,
  onLogin
}: {
  onStart: (planCode?: string) => void;
  onDownloadApp: () => void;
  onLogin: () => void;
}) {
  const [stickyVisible, setStickyVisible] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const monthly = initialPlans.find((plan) => plan.code === "monthly")!;
  const annual = initialPlans.find((plan) => plan.code === "annual")!;
  const annualAnchorCents = monthly.priceInCents * 12;
  const annualSavingsCents = annualAnchorCents - annual.priceInCents;
  const annualInstallmentCents = Math.round(annual.priceInCents / 12);

  useEffect(() => {
    const root = scrollRootRef.current;
    const readY = () => {
      if (root && root.scrollHeight > root.clientHeight + 1) {
        return root.scrollTop;
      }
      return window.scrollY || document.documentElement.scrollTop || 0;
    };
    const onScroll = () => setStickyVisible(readY() > 520);
    onScroll();
    root?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (media.matches) setMobileNavOpen(false);
    };
    closeOnDesktop();
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <main ref={scrollRootRef} className="home-landing">
      {/* 01. Top bar — urgência */}
      <div className="home-topbar border-b border-brand-gold/25 bg-gradient-to-r from-brand-ember/90 via-brand-coral to-brand-amber px-4 py-2.5 text-center text-[12px] font-extrabold leading-snug sm:text-sm">
        Condição especial: garanta seu plano hoje e receba acesso imediato + garantia de 7 dias sem risco.
      </div>

      {/* 02. Navbar fixa */}
      <header className="home-header sticky top-0 z-40 border-b backdrop-blur-md">
        <div className="mx-auto flex min-h-[64px] max-w-6xl items-center justify-between gap-3 px-4 sm:min-h-[72px] sm:gap-4 sm:px-8 md:px-12">
          <a href="#topo" className="inline-flex min-w-0 items-center gap-2 no-underline" aria-label={brand.name}>
            <img
              src={assetUrl("assets/app-treino-logo.svg")}
              alt={brand.name}
              className="h-auto w-[clamp(120px,28vw,190px)]"
            />
            <Zap className="hidden h-4 w-4 shrink-0 text-brand-gold sm:block" aria-hidden="true" />
          </a>
          <nav className="hidden items-center gap-5 lg:flex" aria-label="Navegação principal">
            {landingNav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="home-muted text-sm font-bold transition hover:text-brand-gold"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <ThemeModeSwitch compact />
            <button
              type="button"
              className="home-muted hidden border-0 bg-transparent text-sm font-bold transition hover:text-brand-gold sm:inline-flex"
              onClick={onLogin}
            >
              Entrar
            </button>
            <button
              type="button"
              className="ui-btn-primary !min-h-10 !px-3 !text-xs sm:!min-h-11 sm:!px-4 sm:!text-sm"
              onClick={onDownloadApp}
            >
              Baixar App
              <ArrowRight size={16} className="hidden sm:inline" />
            </button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[color:var(--app-border)] bg-[color:var(--app-fill)] text-sand transition hover:border-brand-gold/40 hover:text-brand-gold lg:hidden"
              aria-label={mobileNavOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((value) => !value)}
            >
              {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        {mobileNavOpen && (
          <nav
            className="home-mobile-nav border-t border-[color:var(--app-border)] px-4 py-4 lg:hidden"
            aria-label="Navegação mobile"
          >
            <div className="mx-auto grid max-w-6xl gap-1">
              {landingNav.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="home-muted rounded-lg px-3 py-3 text-sm font-bold transition hover:bg-[color:var(--app-fill)] hover:text-brand-gold"
                  onClick={() => setMobileNavOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <button
                type="button"
                className="home-muted mt-1 rounded-lg border-0 bg-transparent px-3 py-3 text-left text-sm font-bold transition hover:bg-[color:var(--app-fill)] hover:text-brand-gold sm:hidden"
                onClick={() => {
                  setMobileNavOpen(false);
                  onLogin();
                }}
              >
                Entrar
              </button>
            </div>
          </nav>
        )}
      </header>

      {/* 03. Hero */}
      <section id="topo" className="relative isolate overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${assetUrl("assets/hero-banner-app-treino.png")})` }}
          aria-hidden="true"
        />
        <div className="home-hero-overlay-x absolute inset-0" aria-hidden="true" />
        <div className="home-hero-overlay-y absolute inset-0" aria-hidden="true" />

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-110px)] max-w-6xl items-center gap-8 px-4 py-12 sm:gap-10 sm:px-8 sm:py-16 md:grid-cols-[1.15fr_0.85fr] md:px-12 md:py-20">
          <div className="animate-fade-up max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-brand-gold">
              <span className="inline-flex text-brand-gold" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star key={index} size={12} fill="currentColor" />
                ))}
              </span>
              Aprovado por +10.000 alunos ativos
            </p>
            <h1 className="mt-5 font-display text-[clamp(2.4rem,6.5vw,4.4rem)] font-semibold leading-[0.98] tracking-tight text-sand">
              {brand.name}
            </h1>
            <p className="mt-3 text-sm font-bold uppercase tracking-[0.12em] text-brand-gold">{brand.tagline}</p>
            <p className="mt-4 font-display text-[clamp(1.35rem,3.4vw,2.15rem)] font-medium leading-tight text-sand">
              Chega de adivinhar o que fazer na academia. Treine com foco, evolua cargas e veja resultados no espelho.
            </p>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-sand-muted sm:text-lg">
              O aplicativo que substitui papel e planilhas confusas por um método simples no celular. Saiba exatamente o
              que fazer em cada treino, no seu tempo.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="button" className="ui-btn-primary shadow-glow" onClick={() => onStart()}>
                Quero treinar com clareza agora
                <ArrowRight size={18} />
              </button>
              <a
                href="#planos"
                className="inline-flex items-center justify-center gap-2 text-sm font-extrabold text-sand-muted transition hover:text-brand-gold"
              >
                Ver planos
                <ChevronRight size={18} />
              </a>
            </div>
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-sand-faint sm:text-sm">
              <span className="inline-flex items-center gap-1.5">
                <Lock size={13} className="text-brand-mint" />
                Pagamento 100% seguro
              </span>
              <span aria-hidden="true">•</span>
              <span>Acesso imediato no celular</span>
              <span aria-hidden="true">•</span>
              <span>Cancele quando quiser</span>
            </p>
          </div>

          <div className="animate-fade-up mx-auto w-full max-w-[320px] md:max-w-none" style={{ animationDelay: "120ms" }}>
            <div className="relative rounded-[2rem] border home-panel p-4 shadow-panel backdrop-blur-sm">
              <div className="home-surface rounded-[1.4rem] border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-brand-gold">Sessão A</p>
                    <strong className="font-display text-xl text-sand">Treino de hoje</strong>
                  </div>
                  <span className="rounded-full bg-brand-mint/15 px-3 py-1 text-xs font-extrabold text-brand-mint">
                    Descanso 1:28
                  </span>
                </div>
                <div className="mt-4 grid gap-2">
                  {workoutRows.map((row) => (
                    <div
                      key={row.name}
                      className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-[color:var(--app-border)] bg-[var(--app-fill)] px-3 py-2.5"
                    >
                      <div>
                        <strong className="text-sm text-sand">{row.name}</strong>
                        <p className="text-xs text-sand-muted">
                          {row.sets} · {row.load}
                        </p>
                      </div>
                      <span className="self-center text-xs font-bold text-sand-faint">{row.rest}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--app-fill-strong)]">
                  <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-brand-gold to-brand-coral" />
                </div>
                <p className="mt-2 text-xs font-bold text-sand-muted">3 de 5 exercícios · cargas atualizadas</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 04. Prova social */}
      <section className="home-band border-y" aria-label="Prova social">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-10 sm:grid-cols-2 sm:px-8 md:grid-cols-4 md:px-12">
          {socialProofMetrics.map((item) => (
            <div key={item.label} className="flex items-start gap-3">
              <item.icon className="mt-0.5 shrink-0 text-brand-gold" size={22} />
              <div>
                <strong className="block font-display text-2xl text-sand">{item.value}</strong>
                <span className="text-sm text-sand-muted">{item.label}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 05. Dores vs solução */}
      <section id="app" className="px-5 py-16 sm:px-8 md:px-12">
        <div className="mx-auto max-w-6xl">
          <span className="ui-eyebrow">Você se identifica?</span>
          <h2 className="ui-display mt-4 max-w-3xl text-[clamp(1.8rem,4vw,3rem)]">
            Ainda treina no modo automático sem ver mudanças reais?
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="home-panel rounded-3xl border p-6">
              <p className="mb-5 inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-sand-faint">
                <X size={16} className="text-brand-ember" />
                Sem o {brand.name}
              </p>
              <ul className="grid gap-4">
                {painSolutionRows.map((row) => (
                  <li key={row.pain} className="flex gap-3 text-sm leading-relaxed text-sand-muted">
                    <X className="mt-0.5 shrink-0 text-brand-ember" size={16} />
                    {row.pain}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-brand-gold/35 bg-brand-gold/10 p-6 shadow-glow">
              <p className="mb-5 inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-brand-gold">
                <Check size={16} />
                Com o {brand.name}
              </p>
              <ul className="grid gap-4">
                {painSolutionRows.map((row) => (
                  <li key={row.solution} className="flex gap-3 text-sm leading-relaxed text-sand">
                    <Check className="mt-0.5 shrink-0 text-brand-mint" size={16} />
                    {row.solution}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 06. Para quem é */}
      <section id="para-quem" className="home-band border-y px-5 py-16 sm:px-8 md:px-12">
        <div className="mx-auto max-w-6xl">
          <span className="ui-eyebrow">Segmentação</span>
          <h2 className="ui-display mt-4 max-w-3xl text-[clamp(1.8rem,4vw,3rem)]">
            Projetado sob medida para o seu momento atual
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {audienceSegments.map((item) => (
              <article key={item.title} className="grid gap-3 border-t border-[color:var(--app-border)] pt-5">
                <item.icon className="text-brand-gold" size={24} />
                <h3 className="font-display text-xl text-sand">{item.title}</h3>
                <p className="text-sm leading-relaxed text-sand-muted">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 07. Recursos */}
      <section className="px-5 py-16 sm:px-8 md:px-12" id="recursos">
        <div className="mx-auto max-w-6xl">
          <span className="ui-eyebrow">Método e produto</span>
          <h2 className="ui-display mt-4 max-w-3xl text-[clamp(1.8rem,4vw,3rem)]">
            Tudo o que você precisa para focar apenas em treinar
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {resources.map((resource) => (
              <article key={resource.title} className="grid gap-3 border-t border-[color:var(--app-border)] pt-5">
                <resource.icon className="text-brand-coral" size={24} />
                <h3 className="font-display text-xl text-sand">{resource.title}</h3>
                <p className="text-sm leading-relaxed text-sand-muted">{resource.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 08. Depoimentos */}
      <section id="resultados" className="home-band border-y px-5 py-16 sm:px-8 md:px-12">
        <div className="mx-auto max-w-6xl">
          <span className="ui-eyebrow">Resultados reais</span>
          <h2 className="ui-display mt-4 max-w-3xl text-[clamp(1.8rem,4vw,3rem)]">
            Quem treina com clareza muda de patamar
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {testimonials.map((item) => (
              <figure
                key={item.name}
                className="grid gap-4 rounded-3xl border border-[color:var(--app-border)] bg-[color:var(--app-panel)] p-6"
              >
                <div className="inline-flex text-brand-gold" aria-label="5 estrelas">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} size={16} fill="currentColor" />
                  ))}
                </div>
                <blockquote className="text-base leading-relaxed text-sand">“{item.quote}”</blockquote>
                <figcaption className="text-sm font-bold text-sand-muted">
                  — {item.name}, {item.meta}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* 09. Pricing */}
      <section className="px-5 py-16 sm:px-8 md:px-12" id="planos">
        <div className="mx-auto max-w-6xl">
          <span className="ui-eyebrow">Oferta</span>
          <h2 className="ui-display mt-4 max-w-3xl text-[clamp(1.8rem,4vw,3rem)]">
            Escolha o plano ideal para a sua transformação
          </h2>
          <p className="mt-4 max-w-2xl text-sm text-sand-muted sm:text-base">
            Sem taxas escondidas. Cancele quando quiser diretamente pelo app.
          </p>

          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <article className="home-plan-card grid gap-4 rounded-3xl border border-[color:var(--app-border)] p-6 sm:p-8">
              <div>
                <h3 className="home-plan-title font-display text-2xl">Plano Mensal</h3>
                <p className="home-plan-copy mt-1 text-sm">Flexibilidade para treinar mês a mês.</p>
              </div>
              <div>
                <strong className="font-display text-4xl text-brand-gold">
                  {formatPriceInBRL(monthly.priceInCents)}
                </strong>
                <span className="ml-2 text-sm text-sand-muted">/ mês</span>
              </div>
              <ul className="grid gap-2.5">
                {monthlyPlanPerks.map((perk) => (
                  <li key={perk} className="home-plan-copy flex gap-2 text-sm">
                    <Check size={16} className="mt-0.5 shrink-0 text-brand-mint" />
                    {perk}
                  </li>
                ))}
              </ul>
              <button type="button" className="ui-btn-primary mt-2 w-full sm:w-fit" onClick={() => onStart("monthly")}>
                Assinar plano mensal
                <ArrowRight size={18} />
              </button>
            </article>

            <article className="home-plan-featured relative grid gap-4 rounded-3xl border border-brand-gold/50 p-6 shadow-glow sm:p-8">
              <span className="absolute right-4 top-4 rounded-full bg-brand-gold px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-[color:var(--on-accent)]">
                Mais vendido · melhor custo
              </span>
              <div className="pr-28">
                <h3 className="home-plan-title font-display text-2xl">Plano Anual</h3>
                <p className="home-plan-copy mt-1 text-sm">Para quem está comprometido com resultados de longo prazo.</p>
              </div>
              <div>
                <p className="home-plan-faint text-sm line-through">{formatPriceInBRL(annualAnchorCents)}</p>
                <strong className="font-display text-4xl text-brand-gold">
                  12x de {formatPriceInBRL(annualInstallmentCents)}
                </strong>
                <p className="home-plan-copy mt-1 text-sm">
                  ou {formatPriceInBRL(annual.priceInCents)} à vista — você economiza{" "}
                  {formatPriceInBRL(annualSavingsCents)}
                </p>
              </div>
              <ul className="grid gap-2.5">
                {annualPlanPerks.map((perk) => (
                  <li key={perk} className="home-plan-title flex gap-2 text-sm">
                    <Check size={16} className="mt-0.5 shrink-0 text-brand-mint" />
                    {perk}
                  </li>
                ))}
              </ul>
              <button type="button" className="ui-btn-primary mt-2 w-full sm:w-fit" onClick={() => onStart("annual")}>
                Garantir aproveitamento e economizar
                <ArrowRight size={18} />
              </button>
              <p className="home-plan-faint text-[11px]">
                Economia de {formatPriceInBRL(annualSavingsCents)} em relação a 12 mensalidades no preço de lista.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* 10. Garantia */}
      <section className="border-y border-[color:var(--app-border)] bg-ink-panel/40 px-5 py-16 sm:px-8 md:px-12">
        <div className="mx-auto flex max-w-4xl flex-col items-start gap-5 rounded-3xl border border-brand-mint/25 bg-brand-mint/5 p-6 sm:p-10 md:flex-row md:items-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-brand-mint/15 text-brand-mint">
            <ShieldCheck size={30} />
          </div>
          <div>
            <h2 className="font-display text-2xl text-sand sm:text-3xl">Teste por 7 dias sem compromisso</h2>
            <p className="mt-3 text-sm leading-relaxed text-sand-muted sm:text-base">
              Se você assinar, testar o aplicativo na academia e achar que ele não te ajudou a treinar com mais clareza
              ou constância, basta nos enviar uma mensagem. Devolvemos 100% do seu dinheiro, sem burocracia, perguntas
              ou letras miúdas. O risco é todo nosso.
            </p>
          </div>
        </div>
      </section>

      {/* 11. FAQ */}
      <section className="px-5 py-16 sm:px-8 md:px-12" id="faq">
        <div className="mx-auto max-w-6xl">
          <span className="ui-eyebrow">FAQ</span>
          <h2 className="ui-display mt-4 max-w-3xl text-[clamp(1.8rem,4vw,3rem)]">
            Tire suas dúvidas antes de começar
          </h2>
          <div className="mt-10 grid gap-3">
            {faqItems.map((item) => (
              <details
                key={item.question}
                className="group rounded-2xl border border-[color:var(--app-border)] bg-[color:var(--app-panel)] px-5 py-4 open:border-brand-gold/30"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg text-sand">
                  <h3 className="text-base font-semibold sm:text-lg">{item.question}</h3>
                  <ChevronRight
                    size={20}
                    className="shrink-0 text-brand-gold transition group-open:rotate-90"
                  />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-sand-muted">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 12. CTA final */}
      <section className="home-cta-band border-t border-[color:var(--app-border)] px-5 py-16 sm:px-8 md:px-12">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <span className="ui-eyebrow">Último passo</span>
            <h2 className="home-cta-title ui-display mt-4 text-[clamp(1.8rem,4vw,3rem)]">
              Sua próxima ida à academia pode ser totalmente diferente
            </h2>
            <p className="home-cta-copy mt-3 text-sm sm:text-base">
              Não perca mais tempo treinando sem rumo. Escolha seu plano, entre no app e comece hoje a construir a sua
              melhor versão.
            </p>
          </div>
          <button type="button" className="ui-btn-primary shadow-glow shrink-0" onClick={() => onStart()}>
            Quero começar meu treino agora
            <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* 13. Footer */}
      <footer className="border-t border-[color:var(--app-border)] px-5 py-12 sm:px-8 md:px-12">
        <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div className="flex gap-3">
            <img src={assetUrl("assets/app-treino-mark.svg")} alt="" aria-hidden="true" className="h-10 w-10" />
            <div>
              <strong className="font-display text-lg text-sand">{brand.name}</strong>
              <p className="mt-1 text-sm text-sand-muted">
                {brand.tagline}
              </p>
            </div>
          </div>
          <nav className="grid gap-2 text-sm" aria-label="Navegação">
            <strong className="text-sand">Navegação</strong>
            <a className="text-sand-muted hover:text-brand-gold" href="#topo">
              Início
            </a>
            <a className="text-sand-muted hover:text-brand-gold" href="#recursos">
              Recursos
            </a>
            <a className="text-sand-muted hover:text-brand-gold" href="#resultados">
              Depoimentos
            </a>
            <a className="text-sand-muted hover:text-brand-gold" href="#planos">
              Planos
            </a>
          </nav>
          <nav className="grid gap-2 text-sm" aria-label="Suporte">
            <strong className="text-sand">Suporte</strong>
            <a className="text-sand-muted hover:text-brand-gold" href="#faq">
              Central de Ajuda
            </a>
            <a className="text-sand-muted hover:text-brand-gold" href="#termos">
              Termos de Uso
            </a>
            <a className="text-sand-muted hover:text-brand-gold" href="#privacidade">
              Política de Privacidade
            </a>
            <a className="text-sand-muted hover:text-brand-gold" href="mailto:contato@apptreino.com">
              Fale Conosco
            </a>
          </nav>
          <nav className="grid gap-2 text-sm" aria-label="Redes sociais">
            <strong className="text-sand">Redes sociais</strong>
            <a className="text-sand-muted hover:text-brand-gold" href="https://instagram.com" target="_blank" rel="noreferrer">
              Instagram
            </a>
            <a className="text-sand-muted hover:text-brand-gold" href="https://youtube.com" target="_blank" rel="noreferrer">
              YouTube
            </a>
            <a className="text-sand-muted hover:text-brand-gold" href="https://tiktok.com" target="_blank" rel="noreferrer">
              TikTok
            </a>
          </nav>
        </div>
        <div className="mx-auto mt-10 flex max-w-6xl flex-col gap-2 border-t border-[color:var(--app-border)] pt-6 text-xs text-sand-faint sm:flex-row sm:justify-between">
          <span>© 2026 {brand.legalName} Todos os direitos reservados.</span>
          <span>CNPJ: 00.000.000/0001-00</span>
        </div>
      </footer>

      {/* CTA sticky */}
      <div
        className={`home-sticky-cta fixed inset-x-0 bottom-0 z-50 border-t px-4 py-3 backdrop-blur-md transition duration-300 ${
          stickyVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-extrabold text-sand">Comece agora com garantia de 7 dias</p>
            <p className="truncate text-xs text-sand-muted">Acesso imediato · cancele quando quiser</p>
          </div>
          <button type="button" className="ui-btn-primary w-full sm:ml-auto sm:w-auto !min-h-11 shrink-0 !px-4 !text-sm" onClick={() => onStart()}>
            Quero treinar agora
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </main>
  );
}
