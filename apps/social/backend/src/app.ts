import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import multer from "multer";
import { createServer } from "http";

import { useRoutes } from "./routes";
import { useSocket } from "./sockets";

import { initSentry } from "./shared";

dotenv.config({
  path: process.env.NODE_ENV === "production" ? ".env" : ".env.development"
});

if (!process.env.SECRET) {
  throw new Error("SECRET is required");
}

initSentry();

const app = express();
const httpServer = createServer(app);
const frontendOrigin = (process.env.FRONTEND_URL || "http://localhost:3000")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(express.json({ limit: "1mb" }));
app.use(cors({
  origin: frontendOrigin,
  credentials: true
}));

useRoutes(app);
useSocket(httpServer, frontendOrigin);

app.get("/", (_request, response) => {
  response.json({ success: true });
});

app.use((err: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE"
      ? "Arquivo muito grande."
      : err.code === "LIMIT_FILE_COUNT"
        ? "O carrossel aceita no máximo 10 itens."
        : "Falha no envio do arquivo.";
    return response.status(400).json({ success: false, message });
  }

  if (err instanceof Error && (err.message.includes("imagens") || err.message.includes("vídeo") || err.message.includes("video"))) {
    return response.status(400).json({ success: false, message: err.message });
  }

  next(err);
});

httpServer.listen(process.env.PORT || 8081, () => console.log("Server is running"));
