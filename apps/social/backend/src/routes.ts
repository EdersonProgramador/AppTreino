import { Express } from "express-serve-static-core";
import { appRoutes, admin, authentication, fitness, live, messages, notifications, posts, reels, stories, user } from "./modules";

export function useRoutes(app: Express) {
  app.use("/", appRoutes);
  app.use("/posts", posts);
  app.use("/user", user);
  app.use("/auth", authentication);
  app.use("/notifications", notifications);
  app.use("/messages", messages);
  app.use("/admin", admin);
  app.use("/stories", stories);
  app.use("/reels", reels);
  app.use("/live", live);
  app.use("/fitness", fitness);
}
