import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { GuestChrome } from "../../auth/pages";
import { legalMeta } from "../../lib/legal-content";
import { paths } from "../../auth/paths";

type LegalLayoutProps = {
  title: string;
  children: ReactNode;
};

export function LegalLayout({ title, children }: LegalLayoutProps) {
  return (
    <div className="login-shell">
      <GuestChrome variant="login" />
      <main className="login-page">
        <article className="ui-panel mx-auto max-w-3xl p-6 sm:p-8">
          <p className="ui-eyebrow">Documentos legais</p>
          <h1 className="ui-display text-2xl sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-sand-muted">
            {legalMeta.companyName} · CNPJ {legalMeta.cnpj} · Atualizado em {legalMeta.lastUpdated}
          </p>
          <div className="prose-legal mt-6 space-y-4 text-sm leading-relaxed text-sand-muted">{children}</div>
          <nav className="mt-8 flex flex-wrap gap-4 text-sm">
            <Link className="inline-flex items-center gap-1 text-brand-gold hover:underline" to={paths.home}>
              <ArrowLeft size={14} />
              Voltar ao início
            </Link>
            <Link className="text-brand-gold hover:underline" to={paths.terms}>
              Termos de Uso
            </Link>
            <Link className="text-brand-gold hover:underline" to={paths.privacy}>
              Privacidade
            </Link>
            <Link className="text-brand-gold hover:underline" to={paths.refundPolicy}>
              Reembolso
            </Link>
          </nav>
        </article>
      </main>
    </div>
  );
}
