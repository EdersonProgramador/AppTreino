import { MdOutlineMailOutline } from "react-icons/md";
import { useState } from "react";
import axios from "axios";
import Link from "@/lib/legacy-link";
import Head from "next/head";
import { GetServerSideProps } from "next";
import { EmailSignUp, GithubSignIn, GoogleSignIn } from "@/components/auth";

export default function Register() {
  const [isEmailAuth, setIsEmailAuth] = useState(false);
 
  return (
    <main className="min-h-screen w-full bg-mist px-5 py-10 text-ink sm:px-10 lg:flex lg:items-center lg:justify-center">
      <Head><title>Cadastre-se</title></Head>

      <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-soft sm:p-10">
        {
          !isEmailAuth
          ? (
            <>
              <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-brand">Comece agora</p>
              <h2 className="text-3xl font-medium tracking-tight">Registre-se</h2>

              <hr className="my-6 border-slate-100" />

              <GoogleSignIn />

              <GithubSignIn />

              <div className="flex justify-center py-2">
                <div
                  className="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm transition hover:border-brand/40 hover:shadow-md"
                  onClick={() => setIsEmailAuth(true)}
                >
                  <MdOutlineMailOutline /> Cadastre-se via Email
                </div>
              </div>

              <footer className="mt-6 text-right text-xs text-slate-500">
                <small>
                  Já possui uma conta?
                  <Link href={"/auth/login"}>
                    <a className="ml-1 text-brand underline">Entre</a>
                  </Link>
                </small>
                <p className="mt-3 text-left">
                  Ao continuar, você concorda com os{" "}
                  <Link href="/legal/termos"><a className="text-brand underline">Termos</a></Link>
                  {" e a "}
                  <Link href="/legal/privacidade"><a className="text-brand underline">Privacidade</a></Link>.
                </p>
              </footer>
            </>
          ) : (
            <EmailSignUp 
              setIsEmailAuth={setIsEmailAuth}
            />
          )
        }

      </div>
    </main>
  );
}