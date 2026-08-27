import assert from "node:assert/strict";
import test from "node:test";
import {
  isVideoUpload,
  isVideoUploadExtension,
  resolveUploadExtension
} from "../upload-security.js";

test("accepts practical video containers by filename", () => {
  for (const extension of ["mkv", "avi", "m2ts", "wmv", "3gp", "flv", "mxf", "h265", "av1"]) {
    assert.equal(isVideoUploadExtension(extension), true, extension);
    assert.equal(
      resolveUploadExtension(Buffer.alloc(16), `clip.${extension}`, "lessons", "application/octet-stream"),
      extension
    );
  }
});

test("detects video when browsers send a generic MIME", () => {
  assert.equal(isVideoUpload("camera.mkv", "application/octet-stream"), true);
  assert.equal(isVideoUpload("camera", "video/mp2t"), true);
  assert.equal(resolveUploadExtension(Buffer.alloc(16), "camera", "lessons", "video/mp2t"), "ts");
  assert.equal(resolveUploadExtension(Buffer.alloc(16), "camera", "lessons", "video/x-new-container"), "mp4");
});

test("detects AVI and MPEG program-stream signatures", () => {
  const avi = Buffer.alloc(16);
  avi.write("RIFF", 0, "ascii");
  avi.write("AVI ", 8, "ascii");
  assert.equal(resolveUploadExtension(avi, "clip.bin", "lessons", "application/octet-stream"), "avi");

  const mpg = Buffer.from([0x00, 0x00, 0x01, 0xba, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(resolveUploadExtension(mpg, "clip.bin", "lessons", "application/octet-stream"), "mpg");
});

test("keeps executable extensions forbidden", () => {
  assert.equal(resolveUploadExtension(Buffer.alloc(16), "payload.exe", "lessons", "application/octet-stream"), null);
});
