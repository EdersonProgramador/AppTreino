const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: process.env.NODE_ENV === "production" ? ".env" : ".env.development"
});

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const dir = path.join(__dirname, "..", "backups");
fs.mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = path.join(dir, `rede-social-${stamp}.sql`);

execSync(`pg_dump "${process.env.DATABASE_URL}" -f "${file}"`, {
  stdio: "inherit",
  shell: true
});

console.log(`Backup written to ${file}`);
