import bcrypt from "bcrypt";
import { v4 as uuid } from "uuid";
import { Router } from "express";
import { User } from "@prisma/client";
import { prisma } from "../../config";
import { verifyToken, validate } from "../../middleware";
import {
  authRateLimit,
  createRawToken,
  emailOnlySchema,
  fail,
  getCurrentDate,
  hashToken,
  loginSchema,
  oauthSignInSchema,
  registerEmailSchema,
  resetPasswordSchema,
  sendResetEmail,
  sendVerifyEmail,
  isLocalMail,
  signAuthToken,
  syncAdminRole,
  isVerifiedEmail,
  verifyAuthToken,
  verifyEmailSchema
} from "../../shared";

const authentication = Router();
const BCRYPT_ROUNDS = 10;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

function publicUser(user: Pick<User, "id" | "username" | "email" | "image_url" | "created_on" | "email_verified" | "onboarded" | "role" | "is_private">) {
  return {
    id: user.id,
    name: user.username,
    username: user.username,
    email: user.email,
    picture: user.image_url || process.env.SERVER_URL + "/images/user/profile-user.png",
    createdOn: user.created_on,
    emailVerified: user.email_verified,
    onboarded: user.onboarded,
    role: user.role,
    isPrivate: user.is_private
  };
}

authentication.get("/verify-token", verifyToken, (_request, response) => {
  return response.json({ success: true });
});

authentication.put("/register/email", authRateLimit, validate(registerEmailSchema), async (request, response) => {
  try {
    const { email, name, password, website } = request.body;

    if (typeof website === "string" && website.trim()) {
      return response.json({
        success: true,
        needsVerification: true,
        message: "Conta criada. Confirme o e-mail para entrar."
      });
    }

    const existingUser = await prisma.user.findFirst({
      select: { id: true },
      where: { email }
    });

    if (existingUser) {
      return fail(response, 400, "Este email já está em uso.");
    }

    const id = uuid();
    const createdOn = getCurrentDate();
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const trusted = isVerifiedEmail(email);
    const rawToken = trusted ? "" : createRawToken();

    await prisma.user.create({
      data: {
        id,
        username: name,
        email,
        image_url: null,
        password: hash,
        auth_type: "Email",
        created_on: createdOn,
        email_verified: trusted,
        onboarded: false,
        verify_token: trusted ? null : hashToken(rawToken),
        verify_expires: trusted ? null : new Date(Date.now() + VERIFY_TTL_MS)
      }
    });

    if (!trusted) {
      const mailed = await sendVerifyEmail(email, rawToken);
      return response.json({
        success: true,
        needsVerification: true,
        verifyUrl: isLocalMail() ? mailed.link : undefined,
        message: isLocalMail()
          ? "Conta criada. Abra o link de confirmação (envio local)."
          : "Conta criada. Confirme o e-mail para entrar."
      });
    }

    return response.json({
      success: true,
      needsVerification: false,
      message: "Conta criada. Você já pode entrar."
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao criar usuário.");
  }
});

authentication.post("/verify-email", validate(verifyEmailSchema), async (request, response) => {
  try {
    const tokenHash = hashToken(request.body.token);
    const user = await prisma.user.findFirst({
      where: {
        verify_token: tokenHash,
        verify_expires: { gt: new Date() }
      }
    });

    if (!user) {
      return fail(response, 400, "Link inválido ou expirado.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        email_verified: true,
        verify_token: null,
        verify_expires: null
      }
    });

    return response.json({
      success: true,
      token: signAuthToken({ id: user.id, email: user.email }),
      user: publicUser({ ...user, email_verified: true })
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao confirmar e-mail.");
  }
});

authentication.post("/resend-verify", validate(emailOnlySchema), async (request, response) => {
  try {
    const { email } = request.body;
    const user = await prisma.user.findFirst({ where: { email } });

    let verifyUrl: string | undefined;

    if (user && !user.email_verified && user.password) {
      const rawToken = createRawToken();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          verify_token: hashToken(rawToken),
          verify_expires: new Date(Date.now() + VERIFY_TTL_MS)
        }
      });
      const mailed = await sendVerifyEmail(email, rawToken);
      verifyUrl = isLocalMail() ? mailed.link : undefined;
    }

    return response.json({
      success: true,
      verifyUrl,
      message: isLocalMail() && verifyUrl
        ? "Enviamos o link de confirmação. Use o botão local se o e-mail não chegar."
        : "Se o e-mail existir, enviamos um novo link de confirmação."
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao reenviar confirmação.");
  }
});

authentication.post("/forgot-password", authRateLimit, validate(emailOnlySchema), async (request, response) => {
  try {
    const { email } = request.body;
    const user = await prisma.user.findFirst({ where: { email } });

    if (user?.password) {
      const rawToken = createRawToken();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          reset_token: hashToken(rawToken),
          reset_expires: new Date(Date.now() + RESET_TTL_MS)
        }
      });
      const mailed = await sendResetEmail(email, rawToken);
      return response.json({
        success: true,
        resetUrl: isLocalMail() ? mailed.link : undefined,
        message: isLocalMail()
          ? "Enviamos o link. Use o atalho local se o e-mail não chegar."
          : "Se o e-mail existir, enviamos o link para redefinir a senha."
      });
    }

    return response.json({
      success: true,
      message: "Se o e-mail existir, enviamos o link para redefinir a senha."
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao solicitar redefinição.");
  }
});

authentication.post("/reset-password", validate(resetPasswordSchema), async (request, response) => {
  try {
    const { token, password } = request.body;
    const user = await prisma.user.findFirst({
      where: {
        reset_token: hashToken(token),
        reset_expires: { gt: new Date() }
      }
    });

    if (!user) {
      return fail(response, 400, "Link inválido ou expirado.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(password, BCRYPT_ROUNDS),
        reset_token: null,
        reset_expires: null,
        email_verified: true
      }
    });

    return response.json({
      success: true,
      message: "Senha atualizada. Entre com a nova senha."
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao redefinir senha.");
  }
});

authentication.post("/signin/:authType", validate(oauthSignInSchema), async (request, response) => {
  try {
    const { email, id, image_url, name, bio } = request.body;
    const authType = request.params.authType === "Github" ? "Github" : "Google";

    let user: User | null = await prisma.user.findFirst({
      where: { email }
    });

    if (user === null) {
      user = await prisma.user.create({
        data: {
          id,
          username: name,
          email,
          image_url: image_url || null,
          auth_type: authType,
          created_on: getCurrentDate(),
          bio: bio || null,
          email_verified: true,
          onboarded: false
        }
      });
    } else if (!user.email_verified) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { email_verified: true }
      });
    }

    if (user.suspended_at) {
      return fail(response, 403, "Esta conta foi suspensa.");
    }

    user = await syncAdminRole(user);

    return response.json({
      success: true,
      token: signAuthToken({ id: user.id, email: user.email }),
      message: "Login realizado com sucesso!",
      user: publicUser(user)
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao autenticar usuário.");
  }
});

authentication.post("/login", authRateLimit, validate(loginSchema), async (request, response) => {
  try {
    const { email, password } = request.body;

    const user: User | null = await prisma.user.findFirst({
      where: { email }
    });

    if (user === null) {
      return fail(response, 400, "Essa conta não existe.");
    }

    if (user.password === null) {
      return fail(
        response,
        400,
        `Esta conta foi registrada via ${user.auth_type}, tente "Entrar com ${user.auth_type}".`
      );
    }

    const isEqual = await bcrypt.compare(password, user.password);

    if (!isEqual) {
      return fail(response, 400, "Senha incorreta.");
    }

    if (!user.email_verified) {
      if (isVerifiedEmail(user.email)) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            email_verified: true,
            verify_token: null,
            verify_expires: null
          }
        });
        user.email_verified = true;
      } else {
        return fail(response, 403, "Confirme seu e-mail antes de entrar.");
      }
    }

    if (user.suspended_at) {
      return fail(response, 403, "Esta conta foi suspensa.");
    }

    const signed = await syncAdminRole(user);

    return response.json({
      success: true,
      user: publicUser(signed),
      token: signAuthToken({ id: signed.id, email: signed.email })
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao autenticar usuário.");
  }
});

authentication.post("/recover-user-information", async (request, response) => {
  try {
    const token = request.header("app-token") || "";

    if (!token) {
      return response.json({ message: "Usuário sem autenticação", user: null });
    }

    let decoded: { id?: string; email: string };
    try {
      decoded = verifyAuthToken(token);
    } catch {
      return response.json({ message: "Usuário sem autenticação", user: null });
    }

    const select = {
      id: true,
      username: true,
      email: true,
      image_url: true,
      created_on: true,
      email_verified: true,
      onboarded: true,
      role: true,
      is_private: true,
      suspended_at: true
    };

    let user = decoded.id
      ? await prisma.user.findUnique({ where: { id: decoded.id }, select })
      : await prisma.user.findFirst({ where: { email: decoded.email }, select });

    if (!user || user.suspended_at) {
      return response.json({ message: "Usuário sem autenticação", user: null });
    }

    user = await syncAdminRole(user);

    return response.json({
      success: true,
      user: publicUser(user)
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao selecionar usuário.");
  }
});

export { authentication };
