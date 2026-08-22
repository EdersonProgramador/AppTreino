import path from "path";

export const PUBLIC_DIR = path.resolve(__dirname, "../public");

export function publicPath(...segments: string[]) {
  return path.join(PUBLIC_DIR, ...segments);
}
