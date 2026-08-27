import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { env } from "../../env.js";

const MIN_AUDIO_BYTES = 1_800;
const WHISPER_TIMEOUT_MS = 45_000;

const AUDIO_MIME: Record<string, string> = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/mp4",
  caf: "audio/x-caf",
  "3gp": "audio/3gpp",
  "3gpp": "audio/3gpp",
  mp3: "audio/mpeg",
  mpeg: "audio/mpeg",
  wav: "audio/wav",
  webm: "audio/webm",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  flac: "audio/flac"
};

export function whisperFilename(filename?: string) {
  const raw = (filename || "audio.m4a").split(/[/\\]/).pop() || "audio.m4a";
  const ext = extname(raw).replace(/^\./, "").toLowerCase() || "m4a";
  const safe = AUDIO_MIME[ext] ? ext : "m4a";
  return `coach.${safe}`;
}

export function whisperMime(filename?: string, mimeType?: string) {
  const declared = (mimeType || "").split(";")[0]?.trim().toLowerCase();
  if (declared === "audio/m4a" || declared === "audio/x-m4a" || declared === "audio/aac") return "audio/mp4";
  if (declared && declared !== "application/octet-stream" && declared !== "image/jpeg") return declared;
  const ext = extname(whisperFilename(filename)).replace(".", "");
  return AUDIO_MIME[ext] || "audio/mp4";
}

function ffmpegBin() {
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv) return fromEnv;
  if (typeof ffmpegStatic === "string" && ffmpegStatic) return ffmpegStatic;
  return "";
}

async function convertToMp3(buffer: Buffer, filename: string): Promise<Buffer | null> {
  const bin = ffmpegBin();
  if (!bin) return null;
  const inputExt = extname(whisperFilename(filename)) || ".m4a";
  const input = join(tmpdir(), `coach-in-${randomUUID()}${inputExt}`);
  const output = join(tmpdir(), `coach-out-${randomUUID()}.mp3`);
  try {
    await writeFile(input, buffer);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        bin,
        ["-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", output],
        { windowsHide: true }
      );
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error("ffmpeg timeout"));
      }, 20_000);
      proc.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg ${code}`));
      });
    });
    return await readFile(output);
  } catch {
    return null;
  } finally {
    await Promise.all([unlink(input).catch(() => undefined), unlink(output).catch(() => undefined)]);
  }
}

function toWhisperBlob(buffer: Buffer, mime: string) {
  return new Blob([new Uint8Array(buffer)], { type: mime });
}

async function postWhisper(buffer: Buffer, filename: string, mime: string) {
  const url = `${env.OPENAI_BASE_URL.replace(/\/$/, "")}/audio/transcriptions`;
  const form = new FormData();
  form.append("file", toWhisperBlob(buffer, mime), filename);
  form.append("model", "whisper-1");
  form.append("language", "pt");
  form.append("response_format", "json");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WHISPER_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: form,
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) {
      console.warn("[coach/whisper] OpenAI", response.status, raw.slice(0, 280));
      return null;
    }
    try {
      const data = JSON.parse(raw) as { text?: string };
      return data.text?.trim() || null;
    } catch {
      return null;
    }
  } catch (caught) {
    console.warn("[coach/whisper] fetch failed", caught instanceof Error ? caught.message : caught);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function transcribeAudio(buffer: Buffer, filename: string, mimeType?: string) {
  if (!env.OPENAI_API_KEY) return null;
  if (/ollama\.com|:11434/i.test(env.OPENAI_BASE_URL)) return null;
  if (buffer.byteLength < MIN_AUDIO_BYTES) return null;

  const mp3 = await convertToMp3(buffer, filename);
  if (mp3 && mp3.byteLength >= MIN_AUDIO_BYTES) {
    const text = await postWhisper(mp3, "audio.mp3", "audio/mpeg");
    if (text) return text;
  }

  const name = whisperFilename(filename);
  return postWhisper(buffer, name, whisperMime(name, mimeType));
}
