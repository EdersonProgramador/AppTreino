/**
 * Sobe API (3333) e Vite (5174) juntos — evita 500 no proxy quando a API está offline.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function npmRun(args) {
  return spawn(npmCmd, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32"
  });
}

function waitExit(child) {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`exit ${code}`));
    });
  });
}

await waitExit(npmRun(["run", "build", "--workspace", "@app-treino/shared"]));

const children = [
  npmRun(["run", "dev", "--workspace", "@app-treino/api"]),
  npmRun(["run", "dev", "--workspace", "@app-treino/web"])
];

function shutdown(signal) {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code && code !== 0) {
      shutdown();
      process.exit(code);
    }
  });
}
