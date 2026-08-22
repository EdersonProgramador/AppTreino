import { useEffect, useState } from "react";
import Head from "next/head";
import Router from "next/router";
import { toast } from "react-toastify";
import { api } from "@/lib";
import { useAuth } from "@/hooks";

interface SuggestedUser {
  id: string;
  username: string;
  image_url: string;
  bio: string;
}

export default function Onboarding() {
  const { user, updateUser } = useAuth();
  const [users, setUsers] = useState<SuggestedUser[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await api().get("/user/suggestions");
      if (data?.success) {
        setUsers(data.users);
      }
    })();
  }, []);

  function toggle(id: string) {
    setSelected(current => current.includes(id)
      ? current.filter(item => item !== id)
      : [...current, id]);
  }

  async function finish(followIds: string[]) {
    setLoading(true);
    try {
      const { data } = await api().post("/user/onboard", { followIds });
      if (!data?.success) {
        toast.warning("Não foi possível concluir.");
        return;
      }
      await updateUser();
      Router.push("/");
    } catch {
      toast.warning("Não foi possível concluir.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl">
      <Head><title>Quem seguir</title></Head>
      <section className="rounded-3xl bg-white p-6 shadow-soft sm:p-8">
        <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-brand">Bem-vindo{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</p>
        <h1 className="text-3xl font-medium text-ink">Siga pessoas para montar seu feed</h1>
        <p className="mt-2 text-sm text-slate-500">Escolha algumas contas. Você pode pular e fazer isso depois.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {users.map(item => {
            const active = selected.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggle(item.id)}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left ${active ? "border-brand bg-blue-50" : "border-slate-200 bg-white"}`}
              >
                <img src={item.image_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                <div className="min-w-0">
                  <div className="truncate font-medium text-ink">{item.username}</div>
                  <div className="truncate text-xs text-slate-500">{item.bio}</div>
                </div>
              </button>
            );
          })}
        </div>

        {users.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">Ainda não há sugestões. Você pode continuar e explorar a busca.</p>
        ) : null}

        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            disabled={loading}
            className="rounded-xl border-0 bg-slate-100 px-5 py-3 text-sm font-medium text-ink"
            onClick={() => finish([])}
          >
            Pular
          </button>
          <button
            type="button"
            disabled={loading}
            className="rounded-xl border-0 bg-brand px-5 py-3 text-sm font-medium text-white"
            onClick={() => finish(selected)}
          >
            Continuar
          </button>
        </div>
      </section>
    </main>
  );
}
