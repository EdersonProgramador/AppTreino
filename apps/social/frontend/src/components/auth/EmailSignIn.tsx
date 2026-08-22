import { useState } from "react"
import { toast } from "react-toastify";
import Link from "@/lib/legacy-link";
import { useAuth } from "@/hooks";
import { LoginEmailInfo } from "@/types";

export function EmailSignIn() {
  const [emailLoginInfo, setEmailLoginInfo] = useState<LoginEmailInfo>({
    password: "",
    email: ""
  });

  const [loading, setLoading] = useState(false)

  const { signInEmail } = useAuth();

  async function emailLogin() {

    if (emailLoginInfo.email.length == 0 || emailLoginInfo.email.indexOf("@") == -1)
      return toast.warning("Email inválido");

    if (emailLoginInfo.password.length == 0)
      return toast.warning("Senha inválida");

    setLoading(true);

    await signInEmail({ ...emailLoginInfo });

    setLoading(false);
  }


  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="email" className="form-label">Email</label>
        <input
          id="email"
          type="email"
          required={true}
          placeholder="Email"
          value={emailLoginInfo.email}
          onChange={({target}) => setEmailLoginInfo({ ...emailLoginInfo, email: target.value })}
          className="form-input"
        />
      </div>

      <div>
        <label htmlFor="password" className="form-label">Senha</label>
        <input
          id="password"
          type="password"
          placeholder="Digite sua senha de acesso"
          value={emailLoginInfo.password}
          required={true}
          onChange={({target}) => setEmailLoginInfo({ ...emailLoginInfo, password: target.value })}
          className="form-input"
        />
      </div>

      <button disabled={loading} onClick={emailLogin} type="button" className="mt-3 w-full rounded-xl border-0 bg-brand px-4 py-3 font-medium text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50">
        Entrar
      </button>

      <small className="block pt-1 text-slate-500">
        Ainda não tem conta?
        <Link href={"/auth/register"}>
          <a className="ml-1 font-medium text-brand underline">Registre-se</a>
        </Link>
      </small>

      <small className="block text-slate-500">
        <Link href={"/auth/forgot"}>
          <a className="font-medium text-brand underline">Esqueci minha senha</a>
        </Link>
      </small>
    </div>
  )
}
