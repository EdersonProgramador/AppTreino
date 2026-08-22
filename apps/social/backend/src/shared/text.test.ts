import assert from "assert";
import { extractHashtags, extractMentions } from "./text";

assert.deepStrictEqual(extractHashtags("hoje #Dev e #feed #Dev"), ["dev", "feed"]);
assert.deepStrictEqual(extractHashtags("sem tag"), []);
assert.deepStrictEqual(extractMentions("oi @Ana e @Ana e @jo_1"), ["Ana", "jo_1"]);
assert.deepStrictEqual(extractMentions("sem menção"), []);

console.log("text helpers ok");
