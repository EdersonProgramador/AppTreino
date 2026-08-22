import Link from "@/lib/legacy-link";
import { MdOutlineClose, MdExitToApp, MdOutlineVideocam, MdOutlineGroups } from "react-icons/md";
import { AiOutlineGlobal, AiOutlineHome, AiOutlineMail, AiOutlineSafety, AiOutlineUserAdd, AiOutlineMenu } from "react-icons/ai";
import { BiMoviePlay, BiDumbbell, BiMap } from "react-icons/bi";
import { CgProfile } from "react-icons/cg";
import { useAuth } from "@/hooks";

interface MobileMenuProps {
  setMenuMobileIsOpen: (newArgs: boolean) => void;
  menuMobileIsOpen: boolean;
}

export function MobileMenu({ setMenuMobileIsOpen }: MobileMenuProps) {
  const { user, logOut } = useAuth();

  function close() {
    setMenuMobileIsOpen(false);
  }

  const itemClass =
    "flex items-center gap-3 rounded-xl bg-mist px-4 py-3.5 text-sm font-medium text-ink transition hover:bg-slate-200";

  return (
    <section
      className="fixed inset-0 z-[100] h-screen w-screen bg-black/50"
      onClick={close}
    >
      <div
        className="absolute right-0 flex h-full w-[min(85%,22rem)] flex-col bg-white shadow-soft"
        onClick={event => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-slate-200 ring-2 ring-slate-100">
              <img
                alt="user profile"
                src={user?.picture}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0 truncate text-base font-medium text-ink">
              {user?.name}
            </div>
          </div>

          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl text-ink"
            onClick={close}
            aria-label="Fechar menu"
          >
            <MdOutlineClose />
          </button>
        </header>

        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 py-5">
          <Link href="/">
            <a className={itemClass} onClick={close}>
              <AiOutlineHome className="shrink-0 text-lg text-brand" /> Feed
            </a>
          </Link>

          <Link href="/treino">
            <a className={itemClass} onClick={close}>
              <BiDumbbell className="shrink-0 text-lg text-brand" /> Treino
            </a>
          </Link>

          <Link href="/atividade">
            <a className={itemClass} onClick={close}>
              <BiMap className="shrink-0 text-lg text-brand" /> Atividade
            </a>
          </Link>

          <Link href="/clube">
            <a className={itemClass} onClick={close}>
              <MdOutlineGroups className="shrink-0 text-lg text-brand" /> Clube
            </a>
          </Link>

          <Link href="/menu">
            <a className={itemClass} onClick={close}>
              <AiOutlineMenu className="shrink-0 text-lg text-brand" /> Menu completo
            </a>
          </Link>

          <Link href={`/profile/${user?.id}`}>
            <a className={itemClass} onClick={close}>
              <CgProfile className="shrink-0 text-lg text-brand" /> Meu Perfil
            </a>
          </Link>

          <Link href="/reels">
            <a className={itemClass} onClick={close}>
              <BiMoviePlay className="shrink-0 text-lg text-brand" /> Clipes
            </a>
          </Link>

          <Link href="/live">
            <a className={itemClass} onClick={close}>
              <MdOutlineVideocam className="shrink-0 text-lg text-brand" /> Ao vivo
            </a>
          </Link>

          <Link href="/messages">
            <a className={itemClass} onClick={close}>
              <AiOutlineMail className="shrink-0 text-lg text-brand" /> Mensagens
            </a>
          </Link>

          <Link href="/chat">
            <a className={itemClass} onClick={close}>
              <AiOutlineGlobal className="shrink-0 text-lg text-brand" /> Chat global
            </a>
          </Link>

          <Link href="/requests">
            <a className={itemClass} onClick={close}>
              <AiOutlineUserAdd className="shrink-0 text-lg text-brand" /> Pedidos
            </a>
          </Link>

          {user?.role === "admin" ? (
            <Link href="/admin">
              <a className={itemClass} onClick={close}>
                <AiOutlineSafety className="shrink-0 text-lg text-brand" /> Moderação
              </a>
            </Link>
          ) : null}

          <button
            type="button"
            className={`${itemClass} w-full border-0 text-left`}
            onClick={() => {
              close();
              logOut();
            }}
          >
            <MdExitToApp className="shrink-0 text-lg text-brand" /> Sair
          </button>
        </nav>
      </div>
    </section>
  );
}
