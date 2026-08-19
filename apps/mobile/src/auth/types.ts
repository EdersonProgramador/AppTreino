export type NativeAuthUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "USER" | string;
  phone?: string | null;
};

export type NativeSession = {
  token: string;
  user: NativeAuthUser;
};
