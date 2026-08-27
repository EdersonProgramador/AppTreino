import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { whisperFilename, whisperMime } from "./whisper.js";

describe("whisper audio meta", () => {
  it("normaliza m4a para audio/mp4", () => {
    assert.equal(whisperFilename("coach.m4a"), "coach.m4a");
    assert.equal(whisperMime("coach.m4a", "audio/m4a"), "audio/mp4");
  });

  it("não trata jpeg como áudio", () => {
    assert.equal(whisperMime("coach.m4a", "image/jpeg"), "audio/mp4");
  });
});
