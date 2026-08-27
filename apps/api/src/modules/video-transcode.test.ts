import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ffmpegStatic from "ffmpeg-static";
import { transcodeFileToMp4 } from "../video-transcode.js";

test("normalizes an odd-sized AVI to playable H.264/AAC MP4", async (context) => {
  assert.equal(typeof ffmpegStatic, "string");
  const directory = await mkdtemp(join(tmpdir(), "app-treino-video-"));
  context.after(() => rm(directory, { recursive: true, force: true }));

  const input = join(directory, "input.avi");
  const output = join(directory, "output.mp4");
  const generated = spawnSync(
    ffmpegStatic as string,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=321x241:rate=10",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:sample_rate=44100",
      "-t",
      "0.4",
      "-c:v",
      "rawvideo",
      "-pix_fmt",
      "bgr24",
      "-c:a",
      "pcm_s16le",
      input
    ],
    { encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr);

  await transcodeFileToMp4(input, output);

  const inspected = spawnSync(ffmpegStatic as string, ["-i", output, "-f", "null", "-"], {
    encoding: "utf8"
  });
  assert.equal(inspected.status, 0, inspected.stderr);
  assert.match(inspected.stderr, /Video: h264/i);
  assert.match(inspected.stderr, /Audio: aac/i);
  assert.match(inspected.stderr, /320x240/);
});
