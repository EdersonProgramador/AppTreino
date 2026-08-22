import { useEffect, useRef, useState } from "react";
import Router from "next/router";
import { IoMdExit } from "react-icons/io";
import { BiSearch, BiDumbbell, BiMap } from "react-icons/bi";
import { VscSettingsGear } from "react-icons/vsc";
import { FaUserCircle } from "react-icons/fa";
import { IoChatboxOutline } from "react-icons/io5";
import { AiOutlineUserAdd, AiOutlineMenu } from "react-icons/ai";
import { MdOutlineVideocam, MdOutlineGroups } from "react-icons/md";
import { BiMoviePlay } from "react-icons/bi";
import Link from "@/lib/legacy-link";
import { NotificationBell } from "./NotificationBell";
import { MobileMenu } from "./MobileMenu";
import { useAuth } from "@/hooks";

export function Header() {
  const [dropdownIsOpen, setDropdownIsOpen] = useState(false);
  const [menuMobileIsOpen, setMenuMobileIsOpen] = useState(false);
  const [searchContent, setSearchContent] = useState("");
  const { isAuthenticated, user, logOut } = useAuth();
  const inputSearchRef = useRef(null);

  useEffect(() => {
    if (menuMobileIsOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
  }, [menuMobileIsOpen]);

  useEffect(() => {
    if (inputSearchRef.current && typeof document !== "undefined")
      inputSearchRef.current.value = "";
  }, [Router.pathname]);

  function goToSearch() {
    if (searchContent.length > 0) {
      Router.push(`/search/${searchContent}`);
    }
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <header className="flex w-full items-center gap-2 bg-white px-3 py-2 shadow-sm sm:gap-3 sm:px-4">
      <Link href={"/"}>
        <a aria-label="Feed" className="shrink-0">
          <div className="flex h-10 items-center gap-2 sm:h-11">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-sm font-medium text-white sm:h-11 sm:w-11">
              TS
            </div>
            <span className="hidden text-sm font-medium text-ink sm:inline">Treino Social</span>
          </div>
        </a>
      </Link>

      <div className="flex min-w-0 flex-1 items-center rounded-xl bg-mist px-2 py-1.5 text-slate-500 sm:px-3 sm:py-2">
        <label htmlFor="search_user" className="shrink-0">
          <BiSearch />
        </label>

        <input
          id="search_user"
          ref={inputSearchRef}
          value={searchContent}
          type={"text"}
          placeholder="Pesquisar..."
          onChange={({target}) => setSearchContent(target.value)}
          onKeyPress={event => event.key === "Enter" ? goToSearch() : null}
          className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-slate-400"
        />

        <button
          className="hidden shrink-0 rounded-lg border-0 bg-brand px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex"
          disabled={searchContent.length === 0}
          onClick={goToSearch}
        >
          Pesquisar
        </button>
      </div>

      <nav className="hidden shrink-0 items-center gap-1 xl:flex">
        <Link href="/treino">
          <a className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50">
            <BiDumbbell className="text-base" /> Treino
          </a>
        </Link>
        <Link href="/atividade">
          <a className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50">
            <BiMap className="text-base" /> Atividade
          </a>
        </Link>
        <Link href="/clube">
          <a className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50">
            <MdOutlineGroups className="text-base" /> Clube
          </a>
        </Link>
        <Link href="/reels">
          <a className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50">
            <BiMoviePlay className="text-base" /> Clipes
          </a>
        </Link>
        <Link href="/live">
          <a className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50">
            <MdOutlineVideocam className="text-base" /> Ao vivo
          </a>
        </Link>
        <Link href="/messages">
          <a className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50">
            Mensagens
          </a>
        </Link>
        <Link href="/chat">
          <a className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50">
            <IoChatboxOutline className="text-base" /> Chat
          </a>
        </Link>
        <Link href="/requests">
          <a className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50">
            <AiOutlineUserAdd className="text-base" /> Pedidos
          </a>
        </Link>
        <Link href="/menu">
          <a className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50">
            <AiOutlineMenu className="text-base" /> Menu
          </a>
        </Link>
        {user?.role === "admin" ? (
          <Link href="/admin">
            <a className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50">
              Moderação
            </a>
          </Link>
        ) : null}
      </nav>

      <NotificationBell />

      <div className="relative hidden shrink-0 lg:block">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"
          onClick={() => setDropdownIsOpen(!dropdownIsOpen)}
        >
          <VscSettingsGear />
        </button>
        {dropdownIsOpen ? (
          <div className="absolute right-0 top-12 z-20 w-44 rounded-xl border border-slate-100 bg-white p-2 shadow-soft">
            <Link href={`/profile/${user?.id}`}>
              <a className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink transition hover:bg-slate-50">
                <FaUserCircle className="shrink-0 text-base" /> Meu Perfil
              </a>
            </Link>

            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-3 py-2 text-left text-sm text-ink transition hover:bg-slate-50"
              onClick={() => logOut()}
            >
              <IoMdExit className="shrink-0 text-base" /> Sair
            </button>
          </div>
        ) : null}
      </div>

      <div className="hidden h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-slate-100 lg:block">
        <img
          alt={"user: " + (user?.name || "")}
          src={user?.picture}
          className="h-full w-full object-cover"
        />
      </div>

      <button
        type="button"
        className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-200 ring-2 ring-slate-100 lg:hidden"
        onClick={() => setMenuMobileIsOpen(!menuMobileIsOpen)}
        aria-label="Abrir menu"
      >
        <img
          alt={"user: " + (user?.name || "")}
          src={user?.picture}
          className="h-full w-full object-cover"
        />
      </button>

      {menuMobileIsOpen ? (
        <MobileMenu
          menuMobileIsOpen={menuMobileIsOpen}
          setMenuMobileIsOpen={setMenuMobileIsOpen}
        />
      ) : null}
    </header>
  );
}
