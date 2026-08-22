export interface User {
  id: string;
  image_url: string;
  username: string;
  followers: number;
  following: number;
  created_on: string;
  bio: string;
  cover_color: string;
  havePassword: boolean;
  is_private?: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  picture: string;
  createdOn: string;
  emailVerified?: boolean;
  onboarded?: boolean;
  role?: string;
  isPrivate?: boolean;
}
