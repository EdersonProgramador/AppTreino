import { useEffect, useState } from "react";
import { useAuth } from "@/hooks";
import { toast } from "react-toastify";
import { BsGithub } from "react-icons/bs";



interface GithubSignInProps {
  error?: any;
  token?: any;
}

export function GithubSignIn({ error, token }: GithubSignInProps) {
  const { signInGithub } = useAuth();

  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (token) {
      signInGithub(setLoading, token);
    } else if (error) {
      onFailureGithubSignIn();
    }
  }, []);

  function onFailureGithubSignIn() {
    toast.error(error);
  }

  return (
    <div className="flex justify-center py-2">
      <div
        className={`flex w-full cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm transition hover:border-brand/40 hover:shadow-md ${loading ? "cursor-not-allowed opacity-50" : ""}`}
        onClick={() => 
        window.location.href = `https://github.com/login/oauth/authorize?client_id=${process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID}&scope=user`}
      >
        { loading ? <div className="loadingContainer"><BsGithub /></div> : <BsGithub /> }
        Github 
      </div>
    </div>
  );
}