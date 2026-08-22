import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "@/lib/legacy-link";
import { toast } from "react-toastify";
import { api } from "@/lib";

interface RequestRow {
  id: number;
  user: { id: string; username: string; image_url: string };
}

export default function FollowRequests() {
  const [rows, setRows] = useState<RequestRow[]>([]);

  async function load() {
    const { data } = await api().get("/user/follow-requests");
    if (data?.success) {
      setRows(data.requests);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(id: number, accept: boolean) {
    try {
      await api().post(`/user/follow-requests/${id}/${accept ? "accept" : "reject"}`);
      setRows(current => current.filter(row => row.id !== id));
    } catch {
      toast.warning("Não foi possível atualizar o pedido.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl rounded-3xl bg-white p-6 shadow-soft">
      <Head><title>Pedidos para seguir</title></Head>
      <h1 className="text-2xl font-medium text-ink">Pedidos para seguir</h1>
      <p className="mt-1 text-sm text-slate-500">Contas privadas recebem pedidos antes de liberar o follow.</p>
      <div className="mt-6 space-y-3">
        {rows.map(row => (
          <div key={row.id} className="flex items-center justify-between gap-3 rounded-2xl bg-mist px-4 py-3">
            <Link href={`/profile/${row.user.id}`}>
              <a className="flex min-w-0 items-center gap-3">
                <img src={row.user.image_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                <span className="truncate font-medium text-ink">{row.user.username}</span>
              </a>
            </Link>
            <div className="flex gap-2">
              <button type="button" className="rounded-lg border-0 bg-brand px-3 py-2 text-xs font-medium text-white" onClick={() => decide(row.id, true)}>Aceitar</button>
              <button type="button" className="rounded-lg border-0 bg-white px-3 py-2 text-xs" onClick={() => decide(row.id, false)}>Recusar</button>
            </div>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm text-slate-500">Nenhum pedido pendente.</p> : null}
      </div>
    </main>
  );
}
