import Head from "next/head";
import Link from "@/lib/legacy-link";
import { ReactNode } from "react";

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-mist px-5 py-10 text-ink">
      <Head><title>{title}</title></Head>
      <article className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow-soft sm:p-10">
        <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-brand">Documentos</p>
        <h1 className="text-3xl font-medium">{title}</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-slate-600">{children}</div>
        <p className="mt-8 text-sm">
          <Link href="/auth/login"><a className="text-brand underline">Voltar</a></Link>
        </p>
      </article>
    </main>
  );
}

export default function Termos() {
  return (
    <LegalLayout title="Termos de uso">
      <p>Ao criar uma conta na Rede Social, você concorda em usar o serviço de forma lícita, respeitando outras pessoas e as regras da plataforma.</p>
      <p>É proibido publicar conteúdo ilegal, ofensivo, discriminatório ou que viole direitos de terceiros. A equipe pode remover conteúdo e contas que descumpram estes termos.</p>
      <p>Você é responsável pelas informações da sua conta e pelas publicações feitas a partir dela. Denúncias e bloqueios existem para reduzir abuso entre usuários.</p>
      <p>Estes termos podem ser atualizados. O uso contínuo após mudanças indica ciência das novas regras.</p>
    </LegalLayout>
  );
}
