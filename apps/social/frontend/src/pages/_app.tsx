import { GoogleOAuthProvider } from '@react-oauth/google';
import { ToastContainer } from 'react-toastify';
import { AppShell } from '@/components/layout';
import { ConsentBanner } from '@/components/layout/ConsentBanner';
import { AuthProvider, SocketProvider, useAuth } from '@/hooks';
import { useRouter } from "next/router";
import Router from "next/router";

import 'react-toastify/dist/ReactToastify.css';
import '@/styles/globals.css';
import { useEffect, useState, ReactNode } from 'react';

function AppGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const path = router.pathname;

  useEffect(() => {
    if (!user) {
      return;
    }

    if (user.onboarded === false && path !== "/onboarding") {
      Router.replace("/onboarding");
    }
  }, [user, path]);

  return <>{children}</>;
}

function MyApp({ Component, pageProps }) {
  const [showChrome, setShowChrome] = useState(false);
  const path = useRouter().pathname;

  useEffect(() => {
    const isAuth = path.indexOf("auth") !== -1;
    const isLegal = path.indexOf("legal") !== -1;
    setShowChrome(!isAuth && !isLegal);
  }, [path]);

  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID} >
      <AuthProvider>
        <SocketProvider>
          <AppGate>
            <AppShell showChrome={showChrome}>
              <ToastContainer />
              <Component {...pageProps} />
              <ConsentBanner />
            </AppShell>
          </AppGate>
        </SocketProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}


export default MyApp
