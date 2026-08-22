import { z } from "zod";

export const registerEmailSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto.").max(80),
  email: z.string().trim().email("E-mail inválido.").max(255),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres.").max(72),
  passwordConfirm: z.string(),
  website: z.string().optional()
}).refine((data) => data.password === data.passwordConfirm, {
  message: "Senhas inválidas.",
  path: ["passwordConfirm"]
});

export const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido."),
  password: z.string().min(1, "Informe a senha.")
});

export const oauthSignInSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email("E-mail inválido."),
  image_url: z.string().max(555).optional().nullable(),
  id: z.union([z.string(), z.number()]).transform(String),
  bio: z.string().max(255).optional().nullable()
});

export const newCommentSchema = z.object({
  content: z.string().trim().min(1, "Comentário vazio.").max(2000),
  postID: z.coerce.number().int().positive()
});

export const followSchema = z.object({
  followerID: z.string().min(1, "Usuário inválido.")
});

export const createPostSchema = z.object({
  postContent: z.string().max(5000).optional().default(""),
  createdOn: z.string().max(300).optional()
});

export const chatMessageSchema = z.string().trim().min(1, "Mensagem vazia.").max(2000);

export const searchQuerySchema = z.string().trim().min(1).max(80);

export const feedQuerySchema = z.object({
  mode: z.enum(["for-you", "following"]).default("for-you"),
  page: z.coerce.number().int().min(0).default(0)
});

export const emailOnlySchema = z.object({
  email: z.string().trim().email("E-mail inválido.").max(255)
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(16, "Token inválido.")
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(16, "Token inválido."),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres.").max(72),
  passwordConfirm: z.string()
}).refine((data) => data.password === data.passwordConfirm, {
  message: "Senhas inválidas.",
  path: ["passwordConfirm"]
});

export const reportSchema = z.object({
  targetType: z.enum(["user", "post"]),
  reason: z.string().trim().min(3, "Informe o motivo.").max(500),
  targetUserId: z.string().min(1).optional(),
  postId: z.coerce.number().int().positive().optional()
}).refine((data) => {
  if (data.targetType === "user") {
    return Boolean(data.targetUserId);
  }
  return Boolean(data.postId);
}, {
  message: "Alvo da denúncia inválido."
});

export const dmSchema = z.object({
  content: z.string().trim().min(1, "Mensagem vazia.").max(2000)
});

export const onboardSchema = z.object({
  followIds: z.array(z.string().min(1)).max(20).optional().default([])
});

export const blockSchema = z.object({
  userId: z.string().min(1, "Usuário inválido.")
});

export const adminReportActionSchema = z.object({
  action: z.enum(["dismiss", "hide_post", "suspend_user"])
});

export const storyMetaSchema = z.object({
  caption: z.string().trim().max(120).optional().default(""),
  mood: z.enum(["calor", "noite", "vibe", "foco", "festa", "chuva", "cafe"]).optional()
});

export const reelMetaSchema = z.object({
  caption: z.string().trim().max(220).optional().default(""),
  mood: z.enum(["calor", "noite", "vibe", "foco", "festa", "chuva", "cafe"]).optional()
});

export const liveStartSchema = z.object({
  title: z.string().trim().min(2, "Dê um título à live.").max(80),
  mood: z.enum(["calor", "noite", "vibe", "foco", "festa", "chuva", "cafe"]).optional()
});

export const liveChatSchema = z.object({
  content: z.string().trim().min(1, "Mensagem vazia.").max(280)
});
