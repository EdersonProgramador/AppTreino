import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WebGpsPipeline, noiseRejectReason, type RawGpsFix } from "./gps-filter.ts";

function fix(partial: Partial<RawGpsFix> & Pick<RawGpsFix, "t" | "lat" | "lng">): RawGpsFix {
  return {
    ele: null,
    accuracyM: 10,
    speedMps: 1,
    ...partial
  };
}

describe("web GPS pipeline", () => {
  it("aceita o primeiro lock com accuracy urbana (até 62.5 m)", () => {
    const first = fix({ t: 1, lat: -23.55, lng: -46.63, accuracyM: 40 });
    assert.equal(noiseRejectReason("RUN", first, null), null);
    assert.equal(noiseRejectReason("RUN", first, first), "BAD_ACCURACY");
  });

  it("não atualiza prevRaw quando o ponto é rejeitado", () => {
    const pipeline = new WebGpsPipeline();
    const a = pipeline.process("RUN", fix({ t: 0, lat: -23.55, lng: -46.63 }));
    assert.equal(a.accepted, true);

    const teleport = pipeline.process(
      "RUN",
      fix({ t: 1000, lat: -23.6, lng: -46.7, accuracyM: 10 })
    );
    assert.equal(teleport.accepted, false);

    const nearby = pipeline.process(
      "RUN",
      fix({ t: 2000, lat: -23.55005, lng: -46.63005, speedMps: 1.2 })
    );
    assert.equal(nearby.accepted, true);
  });
});
