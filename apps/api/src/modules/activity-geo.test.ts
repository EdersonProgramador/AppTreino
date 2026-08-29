import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampWeightKg, summarizeTrack, type GpsPoint } from "./activity-geo.js";

function pt(lat: number, lng: number, t: number, ele?: number | null): GpsPoint {
  return { lat, lng, t, ele: ele ?? null, accuracy: 10 };
}

describe("activity-geo metrics", () => {
  it("usa 70 kg fora da faixa e o peso da avaliação dentro", () => {
    assert.equal(clampWeightKg(null), 70);
    assert.equal(clampWeightKg(12), 70);
    assert.equal(clampWeightKg(82), 82);
  });

  it("calcula kcal com o peso do atleta", () => {
    const points = [pt(-23.55, -46.63, 0), pt(-23.551, -46.631, 3600_000)];
    const light = summarizeTrack("RUN", points, 0, 50);
    const heavy = summarizeTrack("RUN", points, 0, 100);
    assert.ok(heavy.calories > light.calories);
    assert.equal(heavy.calories, Math.round(light.calories * 2));
  });

  it("ignora salto de altitude GPS na elevação", () => {
    const points = [
      pt(-23.55, -46.63, 0, 100),
      pt(-23.5501, -46.6301, 1000, 180),
      pt(-23.5502, -46.6302, 2000, 101)
    ];
    const stats = summarizeTrack("RUN", points, 0, 70);
    assert.ok(stats.elevationGainMeters < 10);
  });
});
