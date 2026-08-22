import { ReactNode } from "react";
import Head from "next/head";
import Link from "@/lib/legacy-link";

export function TreinoPage({
  title,
  subtitle,
  children,
  backHref
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  backHref?: string;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl pb-24">
      <Head>
        <title>{title} · Treino Social</title>
      </Head>
      <header className="mb-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
        {backHref ? (
          <Link href={backHref}>
            <a className="mb-2 inline-block text-sm font-medium text-brand">← Voltar</a>
          </Link>
        ) : null}
        <h1 className="text-xl font-medium text-ink sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </header>
      <div className="grid gap-3">{children}</div>
    </main>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-white p-4 shadow-sm ${className}`}>{children}</section>;
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  className = ""
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
  className = ""
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border border-slate-200 bg-mist px-3 py-2 text-sm font-medium text-ink ${className}`}
    >
      {children}
    </button>
  );
}
