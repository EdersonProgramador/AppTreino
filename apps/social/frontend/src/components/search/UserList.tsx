import { useEffect, useState } from "react";
import { BiUnlink } from "react-icons/bi";
import Image from "next/image";
import Link from "@/lib/legacy-link";
import { ImSpinner9 } from "react-icons/im";
import { api } from "@/lib";
import { useAuth } from "@/hooks";

export function UserList({ searchQuery }) {
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    (async() => {
      setLoading(true);

      const { data } = await api().get(`/search/${searchQuery}`);

      if (data.success) {
        setAllUsers(data.users);

      } else {
        alert("Erro ao realizar busca.");
      }

      setLoading(false);
    })();
  }, [searchQuery]);

  return (
    <div className="w-full">
      {
        loading 
        ? (
          <div className="loadingContainer my-12 flex justify-center text-2xl">
            <ImSpinner9 />
          </div>
        ) : <></>
      }

      {
        allUsers.length === 0
        ? <div className="mt-20 flex flex-col items-center justify-center text-center text-2xl text-slate-400"><BiUnlink /> Nenhum resultado encontrado</div>
        :
        <>
          {
            allUsers.map(aUser =>
              <div className="mt-4 w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-3 transition hover:border-brand/30 hover:shadow-sm sm:p-4" key={aUser.id}>
                <Link href={`/profile/${aUser.id}`}>
                  <a>
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full">
                      <img 
                        src={aUser.image_url}
                      />
                    </div>

                    <div className="ml-3 min-w-0">
                      <div className="truncate text-lg text-ink">{aUser.username}</div>
                      { aUser.id === user?.id ? <div className="mt-1 w-max rounded-lg bg-brand px-2 py-1 text-xs text-white">Meu perfil</div> : <></>}
                    </div>
                  </a>
                </Link>
              </div>
            )
          }
          <div className="mt-8 text-center text-sm text-slate-400">Fim dos resultados</div>
        </>
      }

    </div>
  );
}