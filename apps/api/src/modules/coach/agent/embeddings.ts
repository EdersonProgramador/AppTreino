export function tokenize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

export function lexicalEmbed(text: string, dim = 64): number[] {
  const vec = new Array<number>(dim).fill(0);
  for (const token of tokenize(text)) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i += 1) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    vec[Math.abs(hash) % dim] += 1;
  }
  return l2normalize(vec);
}

export function l2normalize(vec: number[]) {
  const n = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vec.map((value) => value / n);
}

export function cosine(a: number[], b: number[]) {
  const len = Math.min(a.length, b.length);
  if (!len) return 0;
  let dot = 0;
  for (let i = 0; i < len; i += 1) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}

export function parseEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const nums = value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  return nums.length ? nums : null;
}
