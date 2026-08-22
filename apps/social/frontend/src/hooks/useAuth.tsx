import { createContext, useContext, useEffect, useState } from "react";
import Router from "next/router";
import { setCookie, destroyCookie } from "nookies"
import { toast } from "react-toastify"
import axios from "axios";
import { OverridableTokenClientConfig } from "@react-oauth/google";
import { api, TOKEN_COOKIE, TOKEN_MAX_AGE } from "@/lib";
import { LoginEmailInfo } from "@/types";


interface AuthContextType {
  isAuthenticated: boolean;
  registerWithEmail: (args: PropsUserInfo) => Promise<void>;
  user: User;
  signInEmail: (args: LoginEmailInfo) => Promise<void>;
  signInGoogle: (overrideConfig?: OverridableTokenClientConfig) => Promise<void>;
  signInGithub: (args: (arg: boolean) => void, token: string) => void;
  logOut: () => void;
  updateUser: () => void;
}

interface PropsUserInfo {
  email: string;
  username: string;
  password: string;
  passwordConfirm?: string;
  image_url?: string;
  website?: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  picture: string;
  createdOn: string;
  emailVerified?: boolean;
  onboarded?: boolean;
  role?: string;
  isPrivate?: boolean;
}

interface ApiEmailSignUpData {
  success: boolean;
  message?: string;
  needsVerification?: boolean;
  verifyUrl?: string;
  token?: string;
  user?: User;
}

interface GoogleOAuthUserInfo {
  data: {
    email: string;
    email_verified: boolean;
    family_name: string;
    given_name: string;
    locale: string;
    name: string;
    picture: string;
    sub: string;
  }
}

function persistSession(token: string) {
  setCookie(null, TOKEN_COOKIE, token, {
    maxAge: TOKEN_MAX_AGE,
    path: "/"
  });
}

function authMessage(error: unknown) {
  const err = error as { response?: { data?: { message?: string } } };
  return err.response?.data?.message;
}


const AuthContext = createContext({} as AuthContextType);


export function AuthProvider({ children }) {
  const [user, setUser] = useState<User>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);


  useEffect(() => {
    setIsAuthenticated(Boolean(user));
  }, [user]);

  useEffect(() => {
    updateUser();
  }, []);

  async function updateUser() {
    try {
      const response = await api().post("/auth/recover-user-information");
      if (response?.data?.user) {
        setUser(response.data.user);
      }
    } catch {
      setUser(null);
    }
  }

  async function registerWithEmail({email, username, password, passwordConfirm, website}: PropsUserInfo) {
    try {
      const data = await api().put<ApiEmailSignUpData>("/auth/register/email", {
        email, name: username, password, passwordConfirm, website
      });

      if (!data?.data?.success) {
        toast.warning(String(data?.data?.message || "Não foi possível criar a conta."));
        return;
      }

      toast.success(String(data.data.message || "Confirme seu e-mail para entrar."));
      if (data.data.verifyUrl) {
        window.setTimeout(() => {
          window.location.href = String(data.data.verifyUrl);
        }, 800);
        return;
      }
      setTimeout(() => Router.push("/auth/login"), 1500);
    } catch (error) {
      toast.warning(authMessage(error) || "Não foi possível criar a conta.");
    }
  }

  async function signInEmail({ email, password }: LoginEmailInfo) {
    toast.loading("Carregando", { autoClose: false });

    try {
      const response = await api().post("/auth/login", {
        email, password
      });

      toast.dismiss();

      if (!response?.data?.token) {
        toast.warning(response?.data?.message || "Não foi possível entrar.");
        return;
      }

      persistSession(response.data.token);
      setUser(response.data.user);
      toast.success("Login realizado com sucesso! Redirecionando...");
      Router.push("/");
    } catch (error) {
      toast.dismiss();
      toast.warning(authMessage(error) || "Não foi possível entrar.");
    }
  }


  async function signInGoogle(response) {
    try {
      const resp: GoogleOAuthUserInfo = await axios.get(
        `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${response.access_token}`
      );

      const res = await api().post("/auth/signin/Google", {
        email: resp?.data?.email,
        name: resp?.data?.name,
        password: null,
        id: resp?.data?.sub,
        image_url: resp?.data?.picture
      });

      if (res?.data?.success) {
        persistSession(res.data.token);
        toast.success("Conectado! redirecionando...", { autoClose: 2000 });
        setUser({ ...res.data.user });
        setTimeout(() => Router.push("/") , 1500);
      }
    } catch (error) {
      toast.error(authMessage(error) || "Falha ao entrar com Google.");
    }
  }


  async function signInGithub(setLoading: (args: boolean) => void, token: string) {
    setLoading(true);

    try {
      const resp = await axios({
        method: "GET",
        url: "https://api.github.com/user/emails",
        headers: {
          "Authorization": `token ${token}`,
        },
      });

      const { data: userInfo } = await axios({
        method: "GET",
        url: "https://api.github.com/user",
        headers: {
          "Authorization": `token ${token}`,
        },
      });

      const { data: response } = await api().post("/auth/signin/Github", {
        email: resp?.data[0]?.email,
        name: userInfo.login,
        password: null,
        id: userInfo.id,
        image_url: userInfo.avatar_url,
        bio: userInfo.bio
      });

      if (response?.success) {
        persistSession(response.token);
        toast.success("Conectado! redirecionando...", { autoClose: 1500 });
        setUser({ ...response.user });
        setTimeout(() => Router.push("/") , 1500);
      }

    } catch(e) {
      toast.error(authMessage(e) || "Falha ao entrar com GitHub.");
    }

    setLoading(false);
  }

  function logOut() {
    destroyCookie(null, TOKEN_COOKIE, {
      path: "/"
    });

    window.location.pathname = "/auth/login";
  }

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      user,
      registerWithEmail,
      signInEmail,
      signInGoogle,
      signInGithub,
      logOut,
      updateUser
    }}>
      { children }
    </AuthContext.Provider>
  );
}


export function useAuth() {
  const context = useContext(AuthContext);

  return context;
}
