import { TbFaceIdError } from "react-icons/tb";
import Link from "@/lib/legacy-link";
import Head from "next/head";

export default function Custom404() {
  return (
    <div className="flex min-h-[calc(100dvh-5rem)] w-full flex-col items-center justify-center text-center">
      <Head><title>404 - Essa página não existe</title></Head>
      <h1 className="text-8xl font-medium text-red-700 sm:text-9xl">404</h1>
      <h1 className="text-2xl font-medium text-ink sm:text-3xl">Página não encontrada</h1>
      <h1 className="text-8xl text-slate-200"><TbFaceIdError /></h1>
      <button className="mt-4 rounded-xl border-0 bg-brand px-10 py-3 font-medium text-white transition hover:bg-brand/90">
        <Link href="/">
          <a>Voltar</a>
        </Link>
      </button>
    </div>
  );
}