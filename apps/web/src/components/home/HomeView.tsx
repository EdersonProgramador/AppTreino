import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronRight, Menu, ShieldCheck, X } from "lucide-react";
import { formatPriceInBRL } from "@app-treino/shared";
import { useCatalogPlans } from "../../hooks/useCatalogPlans";
import { brand } from "../../lib/brand";
import { isLegalIdentityPublic, legalMeta, legalPublicOperatorName } from "../../lib/legal-content";
import { paths } from "../../auth/paths";
import { assetUrl } from "../../lib/urls";
import {
  audienceSegments,
  bioCoreItems,
  challengeTypes,
  commandCenterPillars,
  communityFeatures,
  faqItems,
  footerCompanyLinks,
  footerProductLinks,
  footerSupportLinks,
  heroTrustItems,
  intelligenceFeatures,
  landingNav,
  modalities,
  professionalRoles,
  socialProofMetrics,
  telemetryMetrics,
  testimonials,
  withSystemItems,
  withoutSystemItems,
  workoutPerks,
  workoutRows
} from "../../lib/home-content";
import { formatPlanPriceLines, getMonthlyBaseline } from "../../lib/plan-catalog";

const PRIMARY_CTA = "Ativar agora";

function SectionEyebrow({ children, telemetry = false }: { children: React.ReactNode; telemetry?: boolean }) {
  if (telemetry) {
    return <span className="home-telemetry-label">{children}</span>;
  }
  return (
    <span className="inline-block text-xs font-extrabold uppercase tracking-[0.16em] text-brand-gold">{children}</span>
  );
}

function AtllyLogo({ className = "h-9 w-auto" }: { className?: string }) {
  return <img src={assetUrl("assets/atlly-logo.png")} alt={brand.name} className={className} />;
}

export function HomeView({
  onStart,
  onLogin
}: {
  onStart: (planCode?: string, couponCode?: string) => void;
  onLogin: () => void;
}) {
  const [stickyVisible, setStickyVisible] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const { plans: funnelPlans, loading: plansLoading, monthlyBaseline } = useCatalogPlans();

  useEffect(() => {
    const root = scrollRootRef.current;
    const readY = () => {
      if (root && root.scrollHeight > root.clientHeight + 1) return root.scrollTop;
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
    <main ref={scrollRootRef} className="home-landing home-command text-sand">
      {/* Barra de oportunidade */}
      <div className="home-topbar border-b border-brand-gold/30 bg-gradient-to-r from-black via-[#1a1208] to-black px-4 py-2.5 text-center">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-brand-gold sm:text-xs">
          Condição especial — entre para a ATLLY hoje
        </p>
        <p className="mt-0.5 text-[11px] text-brand-silver sm:text-xs">
          Acesso imediato ao sistema + 7 dias de garantia sem risco.{" "}
          <button type="button" className="font-bold text-brand-amber underline-offset-2 hover:underline" onClick={() => onStart()}>
            {PRIMARY_CTA}
          </button>
        </p>
      </div>

      {/* Header */}
      <header className="home-header sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[64px] max-w-6xl items-center justify-between gap-3 px-4 sm:min-h-[72px] sm:px-8">
          <a href="#topo" className="flex min-w-0 flex-col no-underline" aria-label={brand.name}>
            <AtllyLogo className="h-8 w-auto max-w-[140px] sm:h-9 sm:max-w-[160px]" />
            <span className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.16em] text-brand-silver sm:tracking-[0.22em]">
              {brand.category}
            </span>
          </a>
          <nav className="hidden items-center gap-5 lg:flex" aria-label="Navegação principal">
            {landingNav.map((item) => (
              <a key={item.href} href={item.href} className="text-sm font-bold text-brand-silver transition hover:text-brand-gold">
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button type="button" className="hidden text-sm font-bold text-brand-silver transition hover:text-brand-gold sm:inline-flex" onClick={onLogin}>
              Entrar
            </button>
            <button type="button" className="ui-btn-primary !min-h-10 !px-3 !text-xs sm:!min-h-11 sm:!px-5 sm:!text-sm" onClick={() => onStart()}>
              {PRIMARY_CTA}
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-sand lg:hidden"
              aria-label={mobileNavOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((v) => !v)}
            >
              {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        {mobileNavOpen && (
          <nav className="home-mobile-nav border-t border-white/10 px-4 py-4 lg:hidden" aria-label="Navegação mobile">
            <div className="mx-auto grid max-w-6xl gap-1">
              <p className="home-telemetry-label px-3 pb-2">{brand.areaEyebrow}</p>
              {landingNav.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-3 text-sm font-bold text-brand-silver transition hover:bg-white/5 hover:text-brand-gold"
                  onClick={() => setMobileNavOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <button type="button" className="rounded-lg px-3 py-3 text-left text-sm font-bold text-brand-silver hover:bg-white/5" onClick={() => { setMobileNavOpen(false); onLogin(); }}>
                Entrar
              </button>
              <button
                type="button"
                className="ui-btn-primary mx-3 mt-2 !min-h-11"
                onClick={() => {
                  setMobileNavOpen(false);
                  onStart();
                }}
              >
                {PRIMARY_CTA}
                <ArrowRight size={16} />
              </button>
            </div>
          </nav>
        )}
      </header>

      {/* Hero Command */}
      <section id="topo" className="home-hero-command">
        <div
          className="home-hero-command__media"
          style={{ backgroundImage: `url(${assetUrl("assets/atlly-hero.png")})` }}
          aria-hidden="true"
        />
        <div className="home-hero-command__veil" aria-hidden="true" />
        <div className="home-hero-command__scan" aria-hidden="true" />
        <div className="home-hero-command__frame" aria-hidden="true" />
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col px-4 pb-16 pt-24 sm:px-8 sm:pb-20 sm:pt-28 lg:min-h-[min(100svh,920px)] lg:justify-center lg:pb-24 lg:pt-32">
          <div className="animate-fade-up max-w-3xl">
            <SectionEyebrow telemetry>{brand.areaEyebrow}</SectionEyebrow>
            <h1 className="home-brand-signal mt-6 text-[clamp(2.4rem,7.5vw,4.75rem)] leading-[0.92]">
              Comande sua mente.
              <span className="mt-2 block text-[0.72em] tracking-[0.12em] text-sand">Evolua seu corpo.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-lg font-semibold text-brand-silver">{brand.commandLine}</p>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-sand-muted">
              A ATLLY conecta treino, corrida, caminhada, ciclismo, dados, evolução e comunidade em uma única experiência
              de performance humana.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="button" className="ui-btn-primary shadow-glow" onClick={() => onStart()}>
                {PRIMARY_CTA}
                <ArrowRight size={18} />
              </button>
              <a href="#sistema" className="inline-flex items-center gap-2 text-sm font-extrabold text-brand-silver transition hover:text-brand-gold">
                Conhecer o sistema
                <ChevronRight size={18} />
              </a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-sand-faint">
              {heroTrustItems.map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <Check size={13} className="text-brand-gold" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="animate-fade-up mt-10 max-w-3xl lg:mt-12" style={{ animationDelay: "120ms" }}>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-telemetry-soft">Telemetria integrada</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {telemetryMetrics.slice(0, 8).map((metric) => (
                <span
                  key={metric}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-silver"
                >
                  {metric}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Prova social */}
      <section className="home-band border-y border-white/10" aria-label="Prova social">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
          <SectionEyebrow>Um sistema construído para quem se move</SectionEyebrow>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
          <p className="mt-6 text-[11px] text-sand-faint">
            *Manter esses números somente se forem métricas reais e comprováveis da plataforma.
          </p>
        </div>
      </section>

      {/* Problema + Sem/Com */}
      <section id="sistema" className="px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionEyebrow>O problema</SectionEyebrow>
          <h2 className="ui-display mt-4 max-w-4xl text-[clamp(1.75rem,4vw,2.75rem)] font-bold uppercase leading-tight">
            Treinar não é apenas executar exercícios. É saber para onde você está evoluindo.
          </h2>
          <p className="mt-6 max-w-3xl text-base leading-relaxed text-sand-muted">
            Você treina. Corre. Caminha. Pedala. Mas, quando cada atividade fica isolada, fica difícil compreender sua
            verdadeira evolução. Planilhas se perdem. Cargas são esquecidas. Treinos ficam desorganizados. Métricas não
            conversam entre si.
          </p>
          <p className="mt-3 max-w-3xl text-base font-semibold text-brand-gold">A ATLLY transforma sua jornada em um sistema.</p>
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <div className="home-panel rounded-3xl border border-white/10 p-6">
              <p className="mb-4 text-sm font-extrabold uppercase tracking-wide text-sand-faint">Sem um sistema</p>
              <ul className="grid gap-3">
                {withoutSystemItems.map((item) => (
                  <li key={item} className="flex gap-3 text-sm text-sand-muted">
                    <X className="mt-0.5 shrink-0 text-brand-ember" size={16} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-brand-gold/35 bg-brand-gold/5 p-6 shadow-glow">
              <p className="mb-4 text-sm font-extrabold uppercase tracking-wide text-brand-gold">Com ATLLY</p>
              <ul className="grid gap-3">
                {withSystemItems.map((item) => (
                  <li key={item} className="flex gap-3 text-sm text-sand">
                    <Check className="mt-0.5 shrink-0 text-brand-gold" size={16} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Modalidades */}
      <section id="modalidades" className="home-band border-y border-white/10 px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionEyebrow>Um sistema. Várias formas de evoluir.</SectionEyebrow>
          <h2 className="ui-display mt-4 text-[clamp(1.75rem,4vw,2.75rem)] font-bold uppercase">Encontre sua modalidade</h2>
          <p className="mt-4 max-w-2xl text-sand-muted">
            A ATLLY acompanha diferentes formas de movimento para que sua experiência não fique limitada à musculação.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modalities.map((item) => (
              <article key={item.title} className="home-panel group rounded-2xl border border-white/10 p-5 transition hover:border-brand-gold/30">
                <item.icon className="text-brand-gold" size={24} />
                <h3 className="mt-3 font-display text-lg font-bold uppercase text-sand">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sand-muted">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Performance hub */}
      <section id="performance" className="px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-20">
          {/* Command Center */}
          <div>
            <SectionEyebrow>ATLLY Command Center</SectionEyebrow>
            <h2 className="ui-display mt-4 max-w-3xl text-[clamp(1.75rem,4vw,2.5rem)] font-bold uppercase leading-tight">
              Seu corpo gera dados. A ATLLY transforma dados em direção.
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {commandCenterPillars.map((item) => (
                <article key={item.title} className="rounded-2xl border border-brand-gold/15 bg-gradient-to-b from-white/5 to-transparent p-5">
                  <h3 className="font-display text-lg font-bold uppercase text-brand-gold">{item.title}</h3>
                  <p className="mt-2 text-sm text-sand-muted">{item.text}</p>
                </article>
              ))}
            </div>
          </div>

          {/* Treino digital */}
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionEyebrow>Sua próxima missão está pronta</SectionEyebrow>
              <h2 className="ui-display mt-4 text-[clamp(1.5rem,3.5vw,2.25rem)] font-bold uppercase">Treino digital interativo</h2>
              <p className="mt-4 text-sand-muted">Abra a ATLLY e saiba exatamente o que precisa executar.</p>
              <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                {workoutPerks.map((perk) => (
                  <li key={perk} className="flex gap-2 text-sm text-sand-muted">
                    <Check size={14} className="mt-0.5 text-brand-gold" />
                    {perk}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm font-bold uppercase tracking-wide text-brand-silver">Menos tempo pensando. Mais tempo executando.</p>
            </div>
            <div className="home-panel rounded-3xl border border-white/10 p-5">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-gold">Sessão A</p>
              <div className="mt-4 grid gap-2">
                {workoutRows.map((row) => (
                  <div key={row.name} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <strong className="text-sm text-sand">{row.name}</strong>
                    <p className="text-xs text-sand-muted">
                      {row.sets} · {row.load}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Telemetry */}
          <div>
            <SectionEyebrow>Telemetry</SectionEyebrow>
            <h2 className="ui-display mt-4 text-[clamp(1.5rem,3.5vw,2.25rem)] font-bold uppercase">Cada atividade conta uma história</h2>
            <p className="mt-4 max-w-2xl text-sand-muted">Não veja apenas números. Entenda sua evolução através deles.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {telemetryMetrics.map((metric) => (
                <span key={metric} className="rounded-full border border-brand-gold/25 bg-brand-gold/5 px-3 py-1.5 text-xs font-bold text-brand-silver">
                  {metric}
                </span>
              ))}
            </div>
          </div>

          {/* Inteligência */}
          <div>
            <SectionEyebrow>Inteligência ATLLY</SectionEyebrow>
            <h2 className="ui-display mt-4 text-[clamp(1.5rem,3.5vw,2.25rem)] font-bold uppercase">
              Tecnologia trabalhando ao lado da sua performance
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {intelligenceFeatures.map((item) => (
                <article key={item.title} className="home-panel rounded-2xl border border-white/10 p-5">
                  <item.icon className="text-brand-gold" size={22} />
                  <h3 className="mt-3 font-bold text-sand">{item.title}</h3>
                  <p className="mt-2 text-sm text-sand-muted">{item.text}</p>
                </article>
              ))}
            </div>
            <p className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-sand-muted">
              <strong className="text-brand-gold">ATLLY AI Coach</strong> — uma camada inteligente de orientação dentro da sua
              jornada.* <span className="text-sand-faint">*Adequar às funcionalidades disponíveis na versão publicada.</span>
            </p>
          </div>

          {/* BioCore + Recovery */}
          <div className="grid gap-8 lg:grid-cols-2">
            <article className="home-panel rounded-3xl border border-white/10 p-6">
              <SectionEyebrow>BioCore</SectionEyebrow>
              <h2 className="ui-display mt-3 text-xl font-bold uppercase">Conheça o corpo que você está construindo</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {bioCoreItems.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-sand-muted">
                    <Check size={14} className="text-brand-gold" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm font-bold text-brand-silver">Compare. Analise. Evolua.</p>
            </article>
            <article className="home-panel rounded-3xl border border-brand-gold/20 p-6">
              <SectionEyebrow>Recovery</SectionEyebrow>
              <h2 className="ui-display mt-3 text-xl font-bold uppercase">Evolução também acontece quando você recupera</h2>
              <p className="mt-4 text-sm leading-relaxed text-sand-muted">
                Performance não é apenas intensidade. A ATLLY coloca treino e recuperação dentro da mesma jornada para
                construir uma visão mais completa do atleta.
              </p>
              <p className="mt-4 text-sm font-bold uppercase tracking-wide text-brand-gold">Treine. Recupere. Retorne mais preparado.</p>
            </article>
          </div>
        </div>
      </section>

      {/* Comunidade */}
      <section id="comunidade" className="home-band border-y border-white/10 px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-16">
          <div>
            <SectionEyebrow>Comunidade</SectionEyebrow>
            <h2 className="ui-display mt-4 max-w-3xl text-[clamp(1.75rem,4vw,2.5rem)] font-bold uppercase leading-tight">
              Você treina individualmente. Mas não precisa evoluir sozinho.
            </h2>
            <p className="mt-4 max-w-2xl text-sand-muted">A ATLLY também é uma rede social de atletas.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {communityFeatures.map((item) => (
                <span key={item} className="rounded-full border border-white/15 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-brand-silver">
                  {item}
                </span>
              ))}
            </div>
            <p className="mt-6 text-sm font-bold text-brand-gold">Performance individual. Evolução coletiva.</p>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            <article className="home-panel rounded-3xl border border-white/10 p-6">
              <SectionEyebrow>Desafios</SectionEyebrow>
              <h3 className="mt-3 font-display text-xl font-bold uppercase">Transforme constância em conquista</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {challengeTypes.map((item) => (
                  <span key={item} className="text-xs font-bold text-brand-silver">
                    {item}
                    {item !== challengeTypes[challengeTypes.length - 1] ? " ·" : ""}
                  </span>
                ))}
              </div>
            </article>
            <article className="home-panel rounded-3xl border border-brand-gold/20 p-6">
              <SectionEyebrow>ATLLY Club</SectionEyebrow>
              <h3 className="mt-3 font-display text-xl font-bold uppercase">Sua academia. Seu box. Seu studio. Sua comunidade.</h3>
              <p className="mt-4 text-sm text-sand-muted">
                Conecte atletas às organizações e profissionais responsáveis por sua jornada em um ambiente integrado.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Profissionais */}
      <section id="profissionais" className="px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionEyebrow>Profissionais</SectionEyebrow>
          <h2 className="ui-display mt-4 max-w-3xl text-[clamp(1.75rem,4vw,2.25rem)] font-bold uppercase">
            Tecnologia para quem treina — e para quem transforma vidas através do treino
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {professionalRoles.map((role) => (
              <article key={role.title} className="home-panel rounded-2xl border border-white/10 p-5">
                <h3 className="font-bold text-brand-gold">{role.title}</h3>
                <p className="mt-2 text-sm text-sand-muted">{role.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Para quem é */}
      <section className="home-band border-y border-white/10 px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionEyebrow>Para quem é a ATLLY?</SectionEyebrow>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {audienceSegments.map((item) => (
              <article
                key={item.title}
                className={`rounded-2xl border p-5 ${item.featured ? "border-brand-gold/40 bg-brand-gold/5 shadow-glow" : "border-white/10 bg-white/[0.02]"}`}
              >
                <h3 className="font-display text-lg font-bold text-sand">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sand-muted">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Depoimentos */}
      <section id="resultados" className="px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionEyebrow>Resultados</SectionEyebrow>
          <h2 className="ui-display mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-bold uppercase">
            Resultado não é um evento. É a consequência da constância.
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {testimonials.map((item) => (
              <figure key={item.name} className="home-panel rounded-3xl border border-white/10 p-6">
                <blockquote className="text-base leading-relaxed text-sand">“{item.quote}”</blockquote>
                <figcaption className="mt-4 text-sm font-bold text-sand-muted">
                  — {item.name}, {item.meta}
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-4 text-xs text-sand-faint">Utilize depoimentos somente se forem autênticos e autorizados.</p>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="home-band border-y border-white/10 px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionEyebrow>Planos</SectionEyebrow>
          <h2 className="ui-display mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-bold uppercase">Escolha como você quer começar sua evolução</h2>
          <p className="mt-3 text-sand-muted">Sem complicação. Acesso imediato pelo celular.</p>
          <div className="mt-10 grid gap-5 lg:grid-cols-2 home-plan-grid">
            {plansLoading ? (
              <article className="home-plan-card rounded-3xl border border-white/10 p-6 sm:p-8">
                <p className="text-sm text-sand-muted">Carregando planos…</p>
              </article>
            ) : funnelPlans.length > 0 ? (
              funnelPlans.map((plan) => {
                const priceLines = formatPlanPriceLines(plan, monthlyBaseline);
                const benefits = plan.cardBenefits.length > 0 ? plan.cardBenefits : ["Acesso completo ao ecossistema ATLLY"];
                const featured = plan.isFeatured || Boolean(plan.badgeLabel);

                return (
                  <article
                    key={plan.code}
                    className={`rounded-3xl border p-6 sm:p-8 ${
                      featured ? "home-plan-featured relative border-brand-gold/50 shadow-glow" : "home-plan-card border-white/10"
                    }`}
                  >
                    {plan.badgeLabel ? (
                      <span className="absolute right-4 top-4 rounded-full bg-brand-gold px-3 py-1 text-[10px] font-extrabold uppercase text-black">
                        {plan.badgeLabel}
                      </span>
                    ) : null}
                    <h3 className="font-display text-2xl font-bold uppercase">{plan.name}</h3>
                    {plan.description ? <p className="mt-1 text-sm text-sand-muted">{plan.description}</p> : null}
                    <div className="mt-4">
                      {priceLines.anchor ? <p className="text-sm line-through text-sand-faint">{priceLines.anchor}</p> : null}
                    {plan.couponCode && (plan.discountInCents ?? 0) > 0 ? (
                      <span className="mb-2 inline-flex rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold uppercase text-emerald-300">
                        Cupom {plan.couponCode} · economize {formatPriceInBRL(plan.discountInCents ?? 0)}
                      </span>
                    ) : priceLines.discountLabel ? (
                      <span className="mb-2 inline-flex rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold uppercase text-emerald-300">
                        {priceLines.discountLabel}
                      </span>
                    ) : null}
                      <strong className="font-display text-4xl text-brand-gold">{priceLines.primary}</strong>
                      <p className="mt-1 text-sm text-sand-muted">{priceLines.secondary}</p>
                    </div>
                    <ul className="mt-6 grid gap-2">
                      {benefits.map((perk) => (
                        <li key={perk} className={`flex gap-2 text-sm ${featured ? "text-sand" : "text-sand-muted"}`}>
                          <Check size={16} className="shrink-0 text-brand-gold" />
                          {perk}
                        </li>
                      ))}
                    </ul>
                    <button type="button" className="ui-btn-primary mt-6 w-full sm:w-auto" onClick={() => onStart(plan.code, plan.couponCode ?? undefined)}>
                      Ativar {plan.name.toLowerCase()}
                      <ArrowRight size={18} />
                    </button>
                  </article>
                );
              })
            ) : (
              <article className="home-plan-card rounded-3xl border border-white/10 p-6 sm:p-8">
                <p className="text-sm text-sand-muted">Planos indisponíveis no momento.</p>
              </article>
            )}
          </div>
        </div>
      </section>

      {/* Garantia */}
      <section className="px-4 py-16 sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-5 rounded-3xl border border-brand-gold/25 bg-brand-gold/5 p-6 sm:p-10 md:flex-row md:items-center">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-brand-gold/15 text-brand-gold">
            <ShieldCheck size={30} />
          </div>
          <div>
            <SectionEyebrow>Garantia ATLLY</SectionEyebrow>
            <h2 className="ui-display mt-2 text-2xl font-bold uppercase sm:text-3xl">Entre. Treine. Experimente. Você tem 7 dias para decidir.</h2>
            <p className="mt-3 text-sm leading-relaxed text-sand-muted sm:text-base">
              Use a ATLLY na sua rotina. Explore treinos, registre atividades e conheça o sistema. Se dentro do período de
              garantia a experiência não fizer sentido, solicite cancelamento conforme as condições e receba o reembolso
              aplicável.
            </p>
            <p className="mt-3 text-sm font-bold uppercase tracking-wide text-brand-gold">7 dias. Sem pressão.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionEyebrow>FAQ</SectionEyebrow>
          <div className="mt-8 grid gap-3">
            {faqItems.map((item) => (
              <details key={item.question} className="group rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 open:border-brand-gold/30">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-sand">
                  <h3 className="text-base font-semibold">{item.question}</h3>
                  <ChevronRight size={20} className="shrink-0 text-brand-gold transition group-open:rotate-90" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-sand-muted">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="home-cta-band border-t border-white/10 px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl text-center">
          <AtllyLogo className="mx-auto h-10 w-auto" />
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.24em] text-brand-silver">{brand.category}</p>
          <h2 className="ui-display mt-6 text-[clamp(1.75rem,4vw,2.75rem)] font-bold uppercase leading-tight">
            Sua próxima atividade pode ser o início de uma nova fase.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sand-muted">
            Não apenas treine. Construa sua evolução. Treino, corrida, movimento, dados, comunidade e performance dentro de
            um único sistema.
          </p>
          <p className="mt-6 font-display text-lg font-bold uppercase tracking-wide text-brand-gold">Comande sua mente. Evolua seu corpo.</p>
          <button type="button" className="ui-btn-primary mx-auto mt-8 shadow-glow" onClick={() => onStart()}>
            {PRIMARY_CTA}
            <ArrowRight size={18} />
          </button>
          <p className="mt-4 text-xs text-sand-faint">Acesso imediato · Pagamento seguro · Garantia de 7 dias</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-4 py-12 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <img src={assetUrl("assets/atlly-mark.png")} alt="" aria-hidden="true" className="h-12 w-12" />
            <strong className="mt-3 block font-display text-xl uppercase text-sand">{brand.name}</strong>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-silver">{brand.category}</p>
            <p className="mt-2 text-sm text-sand-muted">{brand.socialLine}</p>
          </div>
          <nav className="grid gap-2 text-sm" aria-label="Produto">
            <strong className="text-sand">Produto</strong>
            {footerProductLinks.map((link) => (
              <a key={link.label} href={link.href} className="text-sand-muted hover:text-brand-gold">
                {link.label}
              </a>
            ))}
          </nav>
          <nav className="grid gap-2 text-sm" aria-label="Empresa">
            <strong className="text-sand">Empresa</strong>
            {footerCompanyLinks.map((link) => (
              <a key={link.label} href={link.href} className="text-sand-muted hover:text-brand-gold">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
            <nav className="grid gap-2 text-sm" aria-label="Suporte">
              <strong className="text-sand">Suporte</strong>
              {footerSupportLinks.map((link) => (
                <a key={link.label} href={link.href} className="text-sand-muted hover:text-brand-gold">
                  {link.label}
                </a>
              ))}
              <a href={`mailto:${legalMeta.contactEmail}`} className="text-sand-muted hover:text-brand-gold">
                Fale Conosco
              </a>
            </nav>
            <nav className="grid gap-2 text-sm" aria-label="Legal">
              <strong className="text-sand">Legal</strong>
              <Link to={paths.terms} className="text-sand-muted hover:text-brand-gold">
                Termos de Uso
              </Link>
              <Link to={paths.privacy} className="text-sand-muted hover:text-brand-gold">
                Política de Privacidade
              </Link>
            </nav>
          </div>
        </div>
        <div className="mx-auto mt-10 flex max-w-6xl flex-col gap-2 border-t border-white/10 pt-6 text-xs text-sand-faint sm:flex-row sm:justify-between">
          <span>© 2026 {legalPublicOperatorName()}. Todos os direitos reservados.</span>
          {isLegalIdentityPublic() ? <span>CNPJ: {legalMeta.cnpj}</span> : null}
        </div>
      </footer>

      {/* Sticky CTA */}
      <div
        className={`home-sticky-cta fixed inset-x-0 bottom-0 z-50 border-t border-brand-gold/20 bg-black/90 px-4 py-3 backdrop-blur-md transition duration-300 ${
          stickyVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-extrabold text-sand">Comece agora — garantia de 7 dias</p>
            <p className="truncate text-xs text-sand-muted">Acesso imediato · ATLLY Human Performance System</p>
          </div>
          <button type="button" className="ui-btn-primary w-full !min-h-11 shrink-0 !px-4 !text-sm sm:ml-auto sm:w-auto" onClick={() => onStart()}>
            {PRIMARY_CTA}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </main>
  );
}
