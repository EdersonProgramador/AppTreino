import { EmailSignIn, GithubSignIn, GoogleSignIn } from "@/components/auth";
import Head from "next/head";
import Link from "@/lib/legacy-link";
import axios from "axios";
import { GetServerSideProps } from "next";

export default function Login({ token, error }) {

  return (
    <main className="min-h-screen w-full bg-mist text-ink lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <Head><title>Entrar</title></Head>

      <section className="relative hidden overflow-hidden bg-brand px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border-[28px] border-white/10" />
        <div className="absolute -bottom-28 -left-20 h-72 w-72 rounded-full border-[22px] border-accent/40" />
        <div className="relative max-w-md">
          <img src="/images/logo.png" alt="Rede Social" className="mb-16 h-14 w-14 rounded-2xl bg-white/95 p-2 object-contain shadow-soft" />
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.24em] text-white/70">Rede Social</p>
          <h1 className="text-5xl font-medium leading-tight">Conecte-se ao que importa.</h1>
          <p className="mt-6 text-lg leading-8 text-white/75">Compartilhe ideias, acompanhe pessoas e mantenha suas conversas em um só lugar.</p>
        </div>
        <p className="relative text-sm text-white/60">Um espaço simples para estar presente.</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-soft sm:p-10">
          <div className="mb-8">
            <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-brand">Bem-vindo de volta</p>
            <h2 className="text-3xl font-medium tracking-tight text-ink">Entrar</h2>
            <p className="mt-2 text-sm text-slate-500">Acesse sua conta para continuar.</p>
          </div>

          <GoogleSignIn />

          <GithubSignIn 
            token={token}
            error={error}
          />

          <p className="my-6 text-center text-sm text-slate-400"><strong className="font-medium">Ou entre com seu e-mail</strong></p>

          <EmailSignIn />

          <p className="mt-6 text-center text-xs text-slate-500">
            Ao continuar, você concorda com os{" "}
            <Link href="/legal/termos"><a className="text-brand underline">Termos</a></Link>
            {" e a "}
            <Link href="/legal/privacidade"><a className="text-brand underline">Privacidade</a></Link>.
          </p>
        </div>
      </section>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {

  if (context.query.code) {
    const {data} = await axios({
      method: "POST",
      url: "https://github.com/login/oauth/access_token",
      params: {
        client_id: process.env.GITHUB_CLIENT_ID || process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: context.query.code
      },
      headers: {
        Accept: "application/json"
      }
    });
    
    if (data.access_token) {
      return { props: { token: data.access_token } }
  
    } else if (data.error) {
      return { props: { error: data.error } }
    }

  } else if (context.query.error) { 
    return { 
      props: { error: context.query.error } 
    }
  }
  
  return {
    props: { }
  }

}