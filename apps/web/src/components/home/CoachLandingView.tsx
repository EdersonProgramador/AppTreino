import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronRight, Menu, X } from "lucide-react";
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
    <main ref={scrollRootRef} className="home-landing home-command coach-landing text-sand">
      <div className="home-topbar border-b border-brand-gold/30 bg-gradient-to-r from-black via-[#1a1208] to-black px-4 py-2.5 text-center">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-brand-gold sm:text-xs">
          Programa Coach ATLLY · comissão de 8%
        </p>
        <p className="mt-0.5 text-[11px] text-brand-silver sm:text-xs">
          Assinatura ativa + promoção admin = coach ativo com selo e receitas.{" "}
          <button type="button" className="font-bold text-brand-amber underline-offset-2 hover:underline" onClick={onSubscribe}>
            Assinar ATLLY
          </button>
        </p>
      </div>

      <header className="home-header sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[64px] max-w-6xl items-center justify-between gap-3 px-4 sm:min-h-[72px] sm:px-8">
          <a href="#topo" className="flex min-w-0 flex-col no-underline" aria-label={brand.name}>
            <AtllyLogo className="h-8 w-auto max-w-[140px] sm:h-9 sm:max-w-[160px]" />
            <span className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.16em] text-brand-silver sm:tracking-[0.22em]">
              Coach ATLLY
            </span>
          </a>
          <nav className="hidden items-center gap-5 lg:flex" aria-label="Navegação coach">
            {coachLandingNav.map((item) => (
              <a key={item.href} href={item.href} className="text-sm font-bold text-brand-silver transition hover:text-brand-gold">
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link to={paths.home} className="hidden text-sm font-bold text-brand-silver no-underline transition hover:text-brand-gold sm:inline-flex">
              Site ATLLY
            </Link>
            <button type="button" className="hidden text-sm font-bold text-brand-silver transition hover:text-brand-gold sm:inline-flex" onClick={onLogin}>
              Entrar
            </button>
            <button type="button" className="ui-btn-primary !min-h-10 !px-3 !text-xs sm:!min-h-11 sm:!px-5 sm:!text-sm" onClick={onSubscribe}>
              Quero ser coach
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-sand lg:hidden"
              aria-label={mobileNavOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((value) => !value)}
            >
              {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        {mobileNavOpen ? (
          <nav className="home-mobile-nav border-t border-white/10 px-4 py-4 lg:hidden" aria-label="Navegação mobile coach">
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

      <section id="topo" className="coach-landing-hero relative overflow-hidden px-4 py-20 sm:px-8 sm:py-24">
        <div className="coach-landing-hero__glow pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative z-10 mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="animate-fade-up max-w-2xl">
            <SectionEyebrow>Painel profissional</SectionEyebrow>
            <h1 className="home-brand-signal mt-6 text-[clamp(2.2rem,6vw,4rem)] leading-[0.95]">
              Treine como atleta.
              <span className="mt-2 block text-[0.78em] tracking-[0.08em] text-brand-gold">Opere como coach.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg font-semibold text-brand-silver">
              Produza treinos, distribua programas, indique alunos e receba comissão — tudo dentro da ATLLY.
            </p>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-sand-muted">
              Coach ATLLY é para quem já vive a plataforma como aluno e quer escalar sua operação com Estúdio de Treinos,
              workspace de organização e afiliado de 8% sobre indicações confirmadas.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="button" className="ui-btn-primary shadow-glow" onClick={onSubscribe}>
                Assinar e começar
                <ArrowRight size={18} />
              </button>
              <button type="button" className="inline-flex items-center gap-2 text-sm font-extrabold text-brand-silver transition hover:text-brand-gold" onClick={onLogin}>
                Já sou aluno — entrar
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

          <article className="home-panel animate-fade-up rounded-3xl border border-brand-gold/25 bg-black/40 p-6 backdrop-blur-sm" style={{ animationDelay: "100ms" }}>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-gold">Requisito</p>
            <h2 className="mt-3 font-display text-2xl font-bold uppercase">Coach ativo</h2>
            <p className="mt-3 text-sm leading-relaxed text-sand-muted">
              Para selo, link de indicação e comissão, você precisa de <strong className="text-sand">duas coisas</strong>:
            </p>
            <ol className="mt-4 grid gap-3 text-sm">
              <li className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <strong className="text-sand">1. Assinatura ATLLY vigente</strong>
                <span className="mt-1 block text-sand-muted">Plano ativo como aluno na plataforma.</span>
              </li>
              <li className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <strong className="text-sand">2. Promoção pelo admin</strong>
                <span className="mt-1 block text-sand-muted">Vínculo COACH em uma organização parceira.</span>
              </li>
            </ol>
          </article>
        </div>
      </section>

      <section id="beneficios" className="home-band border-y border-white/10 px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionEyebrow>Benefícios</SectionEyebrow>
          <h2 className="ui-display mt-4 max-w-3xl text-[clamp(1.75rem,4vw,2.5rem)] font-bold uppercase">
            Ferramentas profissionais no mesmo ecossistema do atleta
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      <section id="estudio" className="px-4 py-16 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionEyebrow>Estúdio de Treinos</SectionEyebrow>
            <h2 className="ui-display mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-bold uppercase">
              Do exercício ao programa publicado
            </h2>
            <p className="mt-4 text-base leading-relaxed text-sand-muted">
              O Estúdio segue o fluxo produzir → publicar → distribuir. Você monta conteúdo próprio ou da organização e
              entrega direto na jornada do aluno.
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
              {["Exercícios", "Divisões", "Programas", "Distribuir"].map((label, index) => (
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

      <section id="comissao" className="home-band border-y border-white/10 px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionEyebrow>Receitas</SectionEyebrow>
          <h2 className="ui-display mt-4 max-w-3xl text-[clamp(1.75rem,4vw,2.25rem)] font-bold uppercase">
            Indique alunos. Receba 8% enquanto estiver ativo.
          </h2>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <ul className="grid gap-3">
              {coachCommissionBullets.map((item) => (
                <li key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-sand-muted">
                  <Check size={16} className="mt-0.5 shrink-0 text-brand-gold" />
                  {item}
                </li>
              ))}
            </ul>
            <article className="home-plan-featured rounded-3xl border border-brand-gold/30 p-6">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-gold">Exemplo</p>
              <p className="mt-3 text-sm text-sand-muted">
                Aluno indicado paga R$ 99/mês → você recebe <strong className="text-sand">R$ 7,92</strong> por pagamento confirmado,
                após carência de 14 dias, enquanto sua assinatura e papel de coach estiverem ativos.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionEyebrow>Como funciona</SectionEyebrow>
          <h2 className="ui-display mt-4 max-w-2xl text-[clamp(1.75rem,4vw,2.25rem)] font-bold uppercase">
            Três passos para coach ativo
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

      <section className="home-cta-band mx-4 mb-16 rounded-3xl px-6 py-12 sm:mx-8 sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="home-cta-title font-display text-[clamp(1.5rem,3vw,2rem)] font-bold uppercase">Pronto para o painel profissional?</p>
            <p className="home-cta-copy mt-3 text-base text-sand-muted">
              Assine a ATLLY, solicite sua promoção a coach e acesse o Estúdio, o workspace e o programa de afiliados.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" className="ui-btn-primary shadow-glow" onClick={onSubscribe}>
              Assinar ATLLY
              <ArrowRight size={18} />
            </button>
            <button type="button" className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/15 px-5 text-sm font-extrabold text-sand transition hover:border-brand-gold/40" onClick={onLogin}>
              Já tenho conta
            </button>
          </div>
        </div>
      </section>

      <section id="faq" className="px-4 pb-20 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <SectionEyebrow>FAQ Coach</SectionEyebrow>
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
            Link oficial:{" "}
            <Link to={paths.coachLanding} className="font-bold text-brand-gold no-underline hover:underline">
              atlly.com.br{paths.coachLanding}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
