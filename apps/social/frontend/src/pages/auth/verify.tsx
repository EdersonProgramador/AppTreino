import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "@/lib/legacy-link";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import { api, TOKEN_COOKIE, TOKEN_MAX_AGE } from "@/lib";
import { setCookie } from "nookies";
import { useAuth } from "@/hooks";

export default function VerifyEmail() {
  const router = useRouter();
  const { updateUser } = useAuth();
  const [status, setStatus] = useState("waiting");
  const [email, setEmail] = useState("");
  const token = typeof router.query.token === "string" ? router.query.token : "";

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    if (!token) {
      setStatus("missing");
      return;
    }

    (async () => {
      try {
        const { data } = await api().post("/auth/verify-email", { token });
        if (!data?.success) {
          setStatus("error");
          toast.warning(data?.message || "Link inválido.");
          return;
        }

        setCookie(null, TOKEN_COOKIE, data.token, {
          maxAge: TOKEN_MAX_AGE,
          path: "/"
        });
        await updateUser();
        setStatus("ok");
        toast.success("E-mail confirmado.");
        setTimeout(() => router.push("/"), 1200);
      } catch (error) {
        setStatus("error");
        const err = error as { response?: { data?: { message?: string } } };
        toast.warning(err.response?.data?.message || "Link inválido ou expirado.");
      }
    })();
  }, [router.isReady, token]);

  async function resend() {
    if (!email.includes("@")) {
      toast.warning("Informe um e-mail válido.");
      return;
    }

    try {
      const { data } = await api().post("/auth/resend-verify", { email });
      toast.success(data?.message || "Se o e-mail existir, enviamos um novo link.");
      if (data?.verifyUrl) {
        window.setTimeout(() => {
          window.location.href = String(data.verifyUrl);
        }, 800);
      }
    } catch {
      toast.warning("Não foi possível reenviar o e-mail.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-mist px-5 py-10 text-ink">
      <Head><title>Confirmar e-mail</title></Head>
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-soft">
        <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-brand">Conta</p>
        <h1 className="text-3xl font-medium">Confirme seu e-mail</h1>
        <p className="mt-3 text-sm text-slate-500">
          {status === "waiting" ? "Validando o link..." : null}
          {status === "ok" ? "Tudo certo. Redirecionando..." : null}
          {status === "error" || status === "missing"
            ? "O link pode ter expirado. Informe seu e-mail para receber outro."
            : null}
        </p>

        {status === "error" || status === "missing" ? (
          <div className="mt-6 space-y-3">
            <input
              className="form-input"
              type="email"
              placeholder="Seu e-mail"
              value={email}
              onChange={({ target }) => setEmail(target.value)}
            />
            <button type="button" className="w-full rounded-xl border-0 bg-brand px-4 py-3 font-medium text-white" onClick={resend}>
              Reenviar confirmação
            </button>
          </div>
        ) : null}

        <p className="mt-6 text-sm text-slate-500">
          <Link href="/auth/login"><a className="text-brand underline">Voltar ao login</a></Link>
        </p>
      </div>
    </main>
  );
}
