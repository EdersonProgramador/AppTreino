import { MdAlternateEmail } from "react-icons/md";
import { AiOutlineArrowLeft } from "react-icons/ai";
import { useState } from "react";
import { ImSpinner2 } from "react-icons/im";
import { useAuth } from "@/hooks";
import { useForm } from "react-hook-form";

import { toast } from "react-toastify";


interface userRegiserValidation {
  username: string;
  email: string;
  password: string;
  passwordConfirm: string;
  website?: string;
}

interface EmailSignUpProps {
  setIsEmailAuth: (args: boolean) => void;
}

export function EmailSignUp({ setIsEmailAuth }: EmailSignUpProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { registerWithEmail } = useAuth();
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [showPassword, setShowPassword] = useState(false);

  async function registerEmail(data: userRegiserValidation) {
    if (!isLoading) {
      if (data.password !== data.passwordConfirm)
        return toast.warning("As senhas não conferem.");

      setIsLoading(true);

      await registerWithEmail({ ...data });

      setIsLoading(false);
    }
  }


  return (
    <div className="space-y-4">

      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-medium text-ink">
          <MdAlternateEmail /> Registre-se com email
        </div>

        <div className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-slate-200" onClick={() => setIsEmailAuth(false)}>
          <AiOutlineArrowLeft />
        </div>
      </header>

      <hr className="border-slate-100" />

      <form onSubmit={handleSubmit(registerEmail)} className="space-y-4">
        <div>
          <label htmlFor={"username"} className="form-label">Nome de usuário</label>
          <input
            id="username"
            placeholder={"Nome de usuário"}
            className={`form-input ${errors.username ? "border-red-500" : ""}`}
            { ...register("username", { required: true }) }
          />
        </div>

        <div>
          <label htmlFor={"email"} className="form-label">Email</label>
          <input
            id="email"
            type={"email"}
            placeholder={"Seu endereço de E-mail"}
            className={`form-input ${errors.email ? "border-red-500" : ""}`}
            { ...register("email", { required: true }) }
          />
        </div>

        <div className="hidden" aria-hidden="true">
          <input tabIndex={-1} autoComplete="off" { ...register("website") } />
        </div>

        <div>
          <label htmlFor={"password"} className="form-label">Senha</label>
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder={"Senha de acesso"}
            className={`form-input ${errors.password ? "border-red-500" : ""}`}
            { ...register("password", { required: true }) }
          />
        </div>

        <div>
          <label htmlFor="passwordConfirm" className="form-label">Digite a senha novamente</label>
          <input
            id="passwordConfirm"
            type={showPassword ? "text" : "password"}
            placeholder={"Confirme sua senha"}
            className={`form-input ${errors.passwordConfirm ? "border-red-500" : ""}`}
            { ...register("passwordConfirm", { required: true }) }
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <input 
            id={"showPassword"} 
            type={"checkbox"} 
            className="form-check"
            onChange={({target}) => setShowPassword(target.checked)}
          />
          <label htmlFor={"showPassword"}>Mostrar senha</label>
        </div>
        
        {
          isLoading
          ? 
            <div className="loadingContainer mb-4 text-lg">
              <ImSpinner2 />
            </div>
          : <></>
        }

        <button
          className="w-full rounded-xl border-0 bg-brand px-4 py-3 font-medium text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isLoading}
          type={"submit"}
        >Finalizar</button>

      </form>

    </div>
  );
}
