import { useState } from "react";
import Head from "next/head";
import Link from "@/lib/legacy-link";
import { toast } from "react-toastify";
import { api } from "@/lib";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.includes("@")) {
      toast.warning("Informe um e-mail válido.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api().post("/auth/forgot-password", { email });
      toast.success(data?.message || "Se o e-mail existir, enviamos o link.");
      if (data?.resetUrl) {
        window.setTimeout(() => {
          window.location.href = String(data.resetUrl);
        }, 800);
      }
    } catch {
      toast.warning("Não foi possível enviar o e-mail.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-mist px-5 py-10 text-ink">
      <Head><title>Esqueci a senha</title></Head>
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-soft">
        <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-brand">Conta</p>
        <h1 className="text-3xl font-medium">Redefinir senha</h1>
        <p className="mt-3 text-sm text-slate-500">Informe o e-mail da conta. Enviaremos um link válido por 1 hora.</p>

        <div className="mt-6 space-y-3">
          <input
            className="form-input"
            type="email"
            placeholder="Seu e-mail"
            value={email}
            onChange={({ target }) => setEmail(target.value)}
          />
          <button
            type="button"
            disabled={loading}
            className="w-full rounded-xl border-0 bg-brand px-4 py-3 font-medium text-white disabled:opacity-50"
            onClick={submit}
          >
            Enviar link
          </button>
        </div>

        <p className="mt-6 text-sm text-slate-500">
          <Link href="/auth/login"><a className="text-brand underline">Voltar ao login</a></Link>
        </p>
      </div>
    </main>
  );
}
