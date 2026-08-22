import Head from "next/head";
import Link from "@/lib/legacy-link";

export default function Privacidade() {
  return (
    <main className="min-h-screen bg-mist px-5 py-10 text-ink">
      <Head><title>Privacidade e LGPD</title></Head>
      <article className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow-soft sm:p-10">
        <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-brand">Documentos</p>
        <h1 className="text-3xl font-medium">Política de privacidade</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-slate-600">
          <p>Tratamos dados pessoais para operar a rede: cadastro, autenticação, publicações, mensagens, denúncias e segurança da conta, nos termos da Lei 13.709/2018 (LGPD).</p>
          <p>Coletamos nome, e-mail, foto, conteúdos publicados, registros de uso e, quando informado, dados de login social (Google ou GitHub).</p>
          <p>Você pode editar o perfil, exportar seus dados (JSON) em Configurações, redefinir a senha e solicitar a exclusão da conta. A exclusão remove seus dados principais e conteúdos associados.</p>
          <p>Não vendemos seus dados. Compartilhamos apenas o necessário para hospedagem, envio de e-mail e armazenamento de imagens, quando esses serviços estiverem configurados.</p>
          <p>Cookies de sessão mantêm você autenticado. O aviso de consentimento na primeira visita registra sua ciência sobre o uso essencial desses dados.</p>
        </div>
        <p className="mt-8 text-sm">
          <Link href="/auth/login"><a className="text-brand underline">Voltar</a></Link>
        </p>
      </article>
    </main>
  );
}
