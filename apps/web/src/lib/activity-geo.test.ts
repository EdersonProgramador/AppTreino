import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LAP_RADIUS_M,
  estimateMotionCount,
  updateLapCrossing,
  type LapMarker
} from "./activity-geo.ts";

const start: LapMarker = { lat: -1.381, lng: -48.39, radiusMeters: LAP_RADIUS_M };

function offset(lat: number, lng: number, northM: number, eastM: number) {
  return {
    lat: lat + northM / 110540,
    lng: lng + eastM / (111320 * Math.cos((lat * Math.PI) / 180))
  };
}

describe("contador de voltas", () => {
  it("não conta enquanto o atleta ainda está no perímetro de partida", () => {
    const near = offset(start.lat, start.lng, 8, 0);
    const next = updateLapCrossing(start, near, { away: false, count: 0, maxAwayMeters: 0 });
    assert.equal(next.completed, false);
    assert.equal(next.count, 0);
  });

  it("conta a volta ao voltar para o perímetro depois de sair ~50 m", () => {
    const away = offset(start.lat, start.lng, 80, 0);
    const out = updateLapCrossing(start, away, { away: false, count: 0, maxAwayMeters: 0 });
    assert.equal(out.completed, false);
    assert.equal(out.away, true);
    assert.ok((out.maxAwayMeters ?? 0) >= 48);

    const back = offset(start.lat, start.lng, 10, 0);
    const lap = updateLapCrossing(start, back, out);
    assert.equal(lap.completed, true);
    assert.equal(lap.count, 1);
    assert.equal(lap.maxAwayMeters, 0);
  });

  it("conta ao passar perto da partida, não só exatamente no ponto", () => {
    const away = offset(start.lat, start.lng, 90, 0);
    const out = updateLapCrossing(start, away, { away: false, count: 0, maxAwayMeters: 0 });
    const nearEdge = offset(start.lat, start.lng, 28, 0);
    const lap = updateLapCrossing(start, nearEdge, out);
    assert.equal(lap.completed, true);
    assert.equal(lap.count, 1);
  });
});

describe("estimativa de passos/pedaladas", () => {
  it("estima passos na corrida e pedaladas no ciclismo", () => {
    assert.equal(estimateMotionCount("RUN", 820), 1000);
    assert.ok(estimateMotionCount("RIDE", 5400) >= 900);
    assert.equal(estimateMotionCount("WALK", 0), 0);
  });
});
