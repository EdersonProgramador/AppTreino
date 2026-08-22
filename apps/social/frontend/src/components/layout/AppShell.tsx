import { ReactNode } from "react";
import { Header } from "./Header";
import { OnlineUsers } from "./OnlineUsers";
import { BottomNav } from "./BottomNav";
import { useRouter } from "next/router";

interface AppShellProps {
  children: ReactNode;
  showChrome: boolean;
}

export function AppShell({ children, showChrome }: AppShellProps) {
  const path = useRouter().pathname;
  const hideAside = path === "/reels" || path.startsWith("/live/");
  return (
    <>
      {showChrome ? <Header /> : null}

      <div id="main-container" className={showChrome ? "has-bottom-nav" : undefined}>
        {showChrome && !hideAside ? <OnlineUsers /> : null}
        {children}
      </div>

      {showChrome ? <BottomNav /> : null}
    </>
  );
}
