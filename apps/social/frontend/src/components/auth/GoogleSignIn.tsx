import { useGoogleLogin } from "@react-oauth/google";
import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { useAuth } from "@/hooks";

  
export function GoogleSignIn() {
  const { signInGoogle } = useAuth();
  const [isLoading, setLoading] = useState(false);
  
  const signin = useGoogleLogin({
    onSuccess: async (response) => {
      setLoading(true);
      await signInGoogle(response);
      setLoading(false);
    }
  });
  
  return (
    <div className="flex justify-center py-2">
      <div
        className={`flex w-full cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm transition hover:border-brand/40 hover:shadow-md ${isLoading ? "cursor-not-allowed opacity-50" : ""}`}
        onClick={() => signin()}
      >
        { isLoading ? <div className={"loadingContainer"}><FcGoogle /></div> : <FcGoogle /> } Entrar com o Google
      </div>
    </div>
  );
}