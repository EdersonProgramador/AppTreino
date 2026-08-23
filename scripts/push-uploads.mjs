import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const uploadsDir = process.env.UPLOADS_DIR ?? join(repoRoot, "apps", "api", "uploads");
const apiUrl = (process.env.API_URL ?? "https://apptreino-backend.onrender.com").replace(/\/+$/, "");
const adminEmail = process.env.ADMIN_EMAIL ?? "admin@apptreino.com";
const adminPassword = process.env.ADMIN_PASSWORD ?? "Admin@123";

async function login() {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: adminEmail,
      password: adminPassword
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Login falhou (${response.status}): ${body}`);
  }

  const payload = await response.json();
  const token = payload.token ?? payload.accessToken;
  if (!token) {
    throw new Error("Login OK, mas token não retornado.");
  }

  return token;
}

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function pushFile(token, absolutePath) {
  const relativePath = relative(uploadsDir, absolutePath).replace(/\\/g, "/");
  const form = new FormData();
  form.append("file", new Blob([await readFileBuffer(absolutePath)]), basename(absolutePath));

  const response = await fetch(`${apiUrl}/admin/uploads/mirror?path=${encodeURIComponent(relativePath)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${relativePath} (${response.status}): ${body}`);
  }
}

async function readFileBuffer(path) {
  const { readFile } = await import("node:fs/promises");
  return readFile(path);
}

async function main() {
  try {
    await stat(uploadsDir);
  } catch {
    throw new Error(`Pasta de uploads não encontrada: ${uploadsDir}`);
  }

  const files = await collectFiles(uploadsDir);
  if (files.length === 0) {
    console.log("Nenhum arquivo em apps/api/uploads.");
    return;
  }

  console.log(`Enviando ${files.length} arquivo(s) para ${apiUrl} ...`);
  const token = await login();

  let ok = 0;
  for (const filePath of files) {
    const label = relative(uploadsDir, filePath).replace(/\\/g, "/");
    process.stdout.write(`→ ${label} ... `);
    try {
      await pushFile(token, filePath);
      ok += 1;
      console.log("ok");
    } catch (error) {
      console.log("erro");
      throw error;
    }
  }

  console.log(`Concluído: ${ok}/${files.length} arquivo(s).`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
