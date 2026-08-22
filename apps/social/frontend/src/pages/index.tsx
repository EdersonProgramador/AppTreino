import { useState } from "react";
import { Feed, NewPost } from "@/components/feed";
import { StoryRail } from "@/components/media/StoryRail";
import { api } from "@/lib";
import { FeedMode, PostBody } from "@/types";
import Head from "next/head";

export default function Home() {
  const [allPosts, setAllPosts] = useState<PostBody[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [finishPosts, setFinishPosts] = useState(false);
  const [mode, setMode] = useState<FeedMode>("for-you");
  const [followingCount, setFollowingCount] = useState(0);

  async function getRecentPosts(reset: boolean, nextMode: FeedMode = mode) {
    setIsLoading(true);

    try {
      const page = reset ? 0 : pageIndex;
      const response = await api().get("/posts/feed", {
        params: { mode: nextMode, page }
      });
      const data = response?.data;

      if (!data?.success) {
        return;
      }

      setFollowingCount(Number(data.followingCount) || 0);

      if (reset) {
        setAllPosts([...data.posts]);
        setPageIndex(1);
        setFinishPosts(data.posts.length === 0);
      } else if (data.posts.length > 0) {
        setAllPosts([...allPosts, ...data.posts]);
        setPageIndex(pageIndex + 1);
      } else {
        setFinishPosts(true);
      }
    } finally {
      setIsLoading(false);
    }
  }

  function changeMode(nextMode: FeedMode) {
    if (nextMode === mode) {
      return;
    }

    setMode(nextMode);
    setFinishPosts(false);
    setPageIndex(0);
    getRecentPosts(true, nextMode);
  }

  return (
    <main id={"home_main_feed"}>
      <Head><title>Feed · Treino Social</title></Head>

      <StoryRail />

      <NewPost
        setIsLoading={setIsLoading}
        getRecentPosts={getRecentPosts}
      />

      <Feed
        getRecentPosts={getRecentPosts}
        allPosts={allPosts}
        isLoading={isLoading}
        finishPosts={finishPosts}
        mode={mode}
        onModeChange={changeMode}
        followingCount={followingCount}
      />
    </main>
  );
}
