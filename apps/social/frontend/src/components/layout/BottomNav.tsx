import Link from "@/lib/legacy-link";
import { useRouter } from "next/router";
import { AiOutlineHome, AiOutlineMenu } from "react-icons/ai";
import { BiDumbbell, BiMap } from "react-icons/bi";
import { MdOutlineGroups } from "react-icons/md";
import { useAuth } from "@/hooks";

const tabs = [
  { href: "/", label: "Feed", icon: AiOutlineHome, match: (path: string) => path === "/" },
  { href: "/clube", label: "Clube", icon: MdOutlineGroups, match: (path: string) => path.startsWith("/clube") },
  { href: "/atividade", label: "Atividade", icon: BiMap, match: (path: string) => path.startsWith("/atividade") },
  { href: "/treino", label: "Treino", icon: BiDumbbell, match: (path: string) => path.startsWith("/treino") },
  { href: "/menu", label: "Menu", icon: AiOutlineMenu, match: (path: string) => path.startsWith("/menu") }
];

export function BottomNav() {
  const { isAuthenticated } = useAuth();
  const path = useRouter().pathname;

  if (!isAuthenticated) return null;
  if (path.indexOf("auth") !== -1 || path.indexOf("legal") !== -1) return null;
  if (path.startsWith("/live/") || path === "/reels") return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-3xl items-stretch justify-between px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = tab.match(path);
          return (
            <li key={tab.href} className="flex-1">
              <Link href={tab.href}>
                <a
                  className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[11px] font-medium ${
                    active ? "text-brand" : "text-slate-500"
                  }`}
                >
                  <Icon className="text-xl" />
                  {tab.label}
                </a>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
