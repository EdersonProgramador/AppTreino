export interface PostBody {
  id: number;
  content: string;
  created_on: string;
  fk_user_id: string;
  image_url: string;
  dislikes: number;
  likes: number;
  username: string;
  images: string | null;
}

export type FeedMode = "for-you" | "following";

export interface LikeOrDislike {
  image_url: string;
  post_id: number;
  user_id: string;
  username: string;
  like?: boolean;
  dislike: boolean;
}
