import { UserList } from "@/components/search";
import { Post } from "@/components/post";
import { useRouter } from "next/router";
import Head from "next/head";
import { useEffect, useState } from "react";
import { api } from "@/lib";
import { useAuth } from "@/hooks";
import { PostBody } from "@/types";

export default function SearchPage() {
  const { UserName } = useRouter().query;
  const query = typeof UserName === "string" ? UserName : "";
  const { user } = useAuth();
  const [tab, setTab] = useState<"people" | "posts">(query.startsWith("#") ? "posts" : "people");
  const [posts, setPosts] = useState<PostBody[]>([]);

  useEffect(() => {
    if (!query || tab !== "posts") {
      return;
    }

    (async () => {
      const { data } = await api().get(`/search/posts/${encodeURIComponent(query)}`);
      if (data?.success) {
        setPosts(data.posts);
      }
    })();
  }, [query, tab]);

  return (
    <main className="w-full rounded-2xl bg-white p-5 shadow-sm lg:w-[70%] sm:p-6">
      <Head><title>{`Pesquisar: ${query}`}</title></Head>
      <h2 className="mb-3 text-xl font-medium tracking-tight text-ink sm:text-2xl">Resultados para &apos;{query}&apos;</h2>
      <div className="mb-4 flex gap-2">
        <button type="button" className={`rounded-lg px-3 py-2 text-sm ${tab === "people" ? "bg-brand text-white" : "bg-mist"}`} onClick={() => setTab("people")}>Pessoas</button>
        <button type="button" className={`rounded-lg px-3 py-2 text-sm ${tab === "posts" ? "bg-brand text-white" : "bg-mist"}`} onClick={() => setTab("posts")}>Publicações</button>
      </div>
      {tab === "people" ? (
        <UserList searchQuery={query} />
      ) : (
        posts.map(post => (
          <Post key={post.id} data={post} currentUserId={user?.id} />
        ))
      )}
      {tab === "posts" && posts.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma publicação encontrada.</p>
      ) : null}
    </main>
  );
}
