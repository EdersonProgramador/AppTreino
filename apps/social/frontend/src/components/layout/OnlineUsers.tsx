import { isMobile } from "react-device-detect";
import { useRouter } from "next/router";
import { HiOutlineStatusOnline } from "react-icons/hi";
import { IoChatboxOutline } from "react-icons/io5";
import Link from "@/lib/legacy-link";
import { useAuth, useSocket } from "@/hooks";


export function OnlineUsers() {
  const { pathname } = useRouter();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  
  const {allUsers} = useSocket();

  if (isAuthenticated && !isMobile && pathname !== "/chat")
    return (
      <aside className="hidden h-fit w-[30%] min-w-[240px] max-w-xs rounded-2xl bg-white p-5 shadow-sm lg:block">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center text-base font-medium text-ink">
            <HiOutlineStatusOnline className="mr-2 text-brand" />
            Usuários
          </h2>

          <button
            className="flex items-center gap-1.5 rounded-lg border-0 bg-brand px-3 py-1.5 text-xs font-medium text-white"
            onClick={() => router.push("/chat")}
          >
            Chat global <IoChatboxOutline />
          </button>
        </div>

        <div className="max-h-[40vh] space-y-2 overflow-y-auto">
          {
            allUsers.map(aUser =>
              <Link key={aUser.id} href={`/profile/${aUser.id}`}>
                <a className="flex items-center gap-3 rounded-xl bg-slate-100 px-3 py-2 transition hover:bg-slate-200">
                  <div className="relative shrink-0">
                    <div className="h-9 w-9 overflow-hidden rounded-full bg-slate-200">
                      <img
                        alt={aUser.username}
                        src={aUser.image_url}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <span
                      className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white"
                      style={{ backgroundColor: aUser.isOnline ? "var(--online)" : "var(--offline)" }}
                    />
                  </div>

                  <span className="min-w-0 truncate text-sm font-medium text-ink">
                    {aUser.username}
                  </span>
                </a>
              </Link>
            )
          }
        </div>
      </aside>
    );

  else
    return <></>;
}
