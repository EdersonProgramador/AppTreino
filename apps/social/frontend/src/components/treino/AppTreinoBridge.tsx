import { ReactNode } from "react";
import Head from "next/head";

const TREINO_WEB = process.env.NEXT_PUBLIC_TREINO_WEB_URL || "http://localhost:5174";

/** Abre a área completa do App Treino (preserva player, CMS, loja, etc.). */
export function appTreinoAlunoUrl(section?: string) {
  const base = `${TREINO_WEB.replace(/\/$/, "")}/aluno`;
  return section ? `${base}?section=${encodeURIComponent(section)}` : base;
}

export function AppTreinoBridge({
  title,
  subtitle,
  section,
  children
}: {
  title: string;
  subtitle?: string;
  section?: string;
  children?: ReactNode;
}) {
  const href = appTreinoAlunoUrl(section);

  return (
    <main className="mx-auto w-full max-w-3xl pb-24">
      <Head>
        <title>{title} · App Treino</title>
      </Head>
      <header className="mb-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
        <h1 className="text-xl font-medium text-ink sm:text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {subtitle || "Esta seção roda no App Treino completo — nada foi removido."}
        </p>
      </header>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="mb-4 text-sm text-slate-600">
          Feed, clipes e chat ficam neste shell social. Treino, atividade, loja, pagamentos e o restante
          continuam no App Treino original.
        </p>
        <a
          href={href}
          className="inline-flex rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white"
        >
          Abrir {title} no App Treino
        </a>
        {children ? <div className="mt-4 border-t border-slate-100 pt-4">{children}</div> : null}
      </section>
    </main>
  );
}
