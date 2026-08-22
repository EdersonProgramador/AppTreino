import { Post } from "@/components/post";
import { PostBody, FeedMode } from "@/types";
import { useEffect } from "react";
import { BsSignpostSplitFill } from "react-icons/bs";
import { MdWallpaper } from "react-icons/md";
import { useAuth } from "@/hooks";
import { ImSpinner2 } from "react-icons/im";

interface FeedProps {
  allPosts: PostBody[];
  isLoading: boolean;
  getRecentPosts: (reset: boolean) => void;
  finishPosts: boolean;
  mode: FeedMode;
  onModeChange: (mode: FeedMode) => void;
  followingCount: number;
}

export function Feed({
  allPosts,
  isLoading,
  getRecentPosts,
  finishPosts,
  mode,
  onModeChange,
  followingCount
}: FeedProps) {
  const { user } = useAuth();

  useEffect(() => {
    getRecentPosts(true);
  }, []);

  const emptyCopy = followingCount === 0
    ? "Siga pessoas ou publique algo para montar o feed da sua rede."
    : "Nenhum post encontrado na sua rede.";

  return (
    <div className="mt-8 w-full">
      {isLoading ? (
        <div className="loadingContainer flex justify-center text-2xl">
          <ImSpinner2 className="mb-4 text-brand" />
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-ink sm:text-2xl">
            {mode === "for-you" ? "Para você" : "Seguindo"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "for-you"
              ? "Quem você segue e com quem interage, por proximidade."
              : "Só contas que você segue, das mais novas às mais antigas."}
          </p>
        </div>

        <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 transition ${mode === "for-you" ? "bg-white text-ink shadow-sm" : "text-slate-500"}`}
            onClick={() => onModeChange("for-you")}
          >
            Para você
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 transition ${mode === "following" ? "bg-white text-ink shadow-sm" : "text-slate-500"}`}
            onClick={() => onModeChange("following")}
          >
            Seguindo
          </button>
        </div>
      </div>

      <hr className="my-4 border-slate-200 opacity-100" />

      {allPosts.length === 0 && !isLoading ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-lg text-slate-400">
          <BsSignpostSplitFill className="mx-auto mb-2" /> {emptyCopy}
        </div>
      ) : (
        allPosts.map(post => (
          <Post
            key={post.id}
            data={post}
            currentUserId={user?.id}
          />
        ))
      )}

      <div className="flex justify-center pb-12 pt-8">
        {!finishPosts ? (
          <button
            className="rounded-xl border-0 bg-brand px-6 py-3 text-sm font-medium text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => !isLoading ? getRecentPosts(false) : null}
            disabled={isLoading}
          >
            Carregar mais posts {isLoading ? <ImSpinner2 /> : null}
          </button>
        ) : (
          <div className="text-center text-sm text-slate-400">
            <div>Você chegou ao fim da sua rede.</div>
            <div><MdWallpaper /></div>
          </div>
        )}
      </div>
    </div>
  );
}
