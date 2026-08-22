export interface LoginEmailInfo {
  password: string;
  email: string;
}

export interface RegisterEmailInfo {
  email: string;
  username: string;
  password: string;
  passwordConfirm?: string;
  image_url?: string;
}
