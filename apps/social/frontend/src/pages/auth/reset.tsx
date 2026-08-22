import { useState } from "react";
import Head from "next/head";
import Link from "@/lib/legacy-link";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import { api } from "@/lib";

export default function ResetPassword() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : "";
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!token) {
      toast.warning("Link inválido.");
      return;
    }

    if (password.length < 6) {
      toast.warning("A senha deve ter ao menos 6 caracteres.");
      return;
    }

    if (password !== passwordConfirm) {
      toast.warning("As senhas não conferem.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api().post("/auth/reset-password", {
        token,
        password,
        passwordConfirm
      });
      toast.success(data?.message || "Senha atualizada.");
      router.push("/auth/login");
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.warning(err.response?.data?.message || "Link inválido ou expirado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-mist px-5 py-10 text-ink">
      <Head><title>Nova senha</title></Head>
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-soft">
        <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-brand">Conta</p>
        <h1 className="text-3xl font-medium">Escolha uma nova senha</h1>

        <div className="mt-6 space-y-3">
          <input
            className="form-input"
            type="password"
            placeholder="Nova senha"
            value={password}
            onChange={({ target }) => setPassword(target.value)}
          />
          <input
            className="form-input"
            type="password"
            placeholder="Confirme a senha"
            value={passwordConfirm}
            onChange={({ target }) => setPasswordConfirm(target.value)}
          />
          <button
            type="button"
            disabled={loading}
            className="w-full rounded-xl border-0 bg-brand px-4 py-3 font-medium text-white disabled:opacity-50"
            onClick={submit}
          >
            Salvar senha
          </button>
        </div>

        <p className="mt-6 text-sm text-slate-500">
          <Link href="/auth/login"><a className="text-brand underline">Voltar ao login</a></Link>
        </p>
      </div>
    </main>
  );
}
