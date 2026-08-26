/**
 * Hermes TextDecoder only supports utf-8 and throws on utf-16le/ascii/etc.
 * Wrap so libraries that probe encodings at module load don't crash.
 * Primary fix for h3-js: scripts/patch-h3-hermes.js (postinstall).
 */
const { polyfillGlobal } = require("react-native/Libraries/Utilities/PolyfillFunctions");

require("fast-text-encoding");

const NativeDecoder = globalThis.TextDecoder;
const NativeEncoder = globalThis.TextEncoder;

function SafeTextDecoder(label, options) {
  try {
    return new NativeDecoder(label == null ? "utf-8" : label, options);
  } catch {
    return new NativeDecoder("utf-8", options);
  }
}
SafeTextDecoder.prototype = NativeDecoder.prototype;

polyfillGlobal("TextDecoder", () => SafeTextDecoder);
if (NativeEncoder) {
  polyfillGlobal("TextEncoder", () => NativeEncoder);
}
globalThis.TextDecoder = SafeTextDecoder;
