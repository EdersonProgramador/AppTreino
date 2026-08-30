import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GpsPoint } from "./activity-geo.js";
import {
  chooseMatchStepMeters,
  chunkWithOverlap,
  interpolateMatchedGeometry,
  matchingProfile,
  matchActivityToRoads,
  resampleForMatching,
  stitchMatchedChunks
} from "./activity-map-match.js";

function pt(lat: number, lng: number, t: number, accuracy = 12): GpsPoint {
  return { lat, lng, t, ele: 10, accuracy };
}

describe("activity map matching helpers", () => {
  it("usa walking para corrida e caminhada, cycling para bike", () => {
    assert.equal(matchingProfile("RUN"), "mapbox/walking");
    assert.equal(matchingProfile("WALK"), "mapbox/walking");
    assert.equal(matchingProfile("RIDE"), "mapbox/cycling");
  });

  it("reesampleia mantendo início e fim", () => {
    const points = Array.from({ length: 40 }, (_, i) => pt(-23.55, -46.63 + i * 0.0002, i * 1000));
    const sampled = resampleForMatching(points, 40);
    assert.equal(sampled[0], points[0]);
    assert.equal(sampled[sampled.length - 1], points[points.length - 1]);
    assert.ok(sampled.length < points.length);
  });

  it("aumenta o passo em trajetos longos para caber nos chunks", () => {
    const points = Array.from({ length: 200 }, (_, i) => pt(-23.55, -46.63 + i * 0.01, i * 1000));
    assert.ok(chooseMatchStepMeters(points, 100) > 12);
  });

  it("parte em janelas com overlap", () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    const chunks = chunkWithOverlap(items, 5, 2);
    assert.equal(chunks[0]?.length, 5);
    assert.equal(chunks[0]?.[3], chunks[1]?.[0]);
    assert.equal(chunks[chunks.length - 1]?.at(-1), 11);
  });

  it("costura chunks pelo tempo, sem duplicar o overlap", () => {
    const a = [pt(0, 0, 1000), pt(0, 0.001, 2000), pt(0, 0.002, 3000)];
    const b = [pt(0, 0.0015, 2500), pt(0, 0.002, 3000), pt(0, 0.003, 4000)];
    const stitched = stitchMatchedChunks([a, b]);
    assert.deepEqual(
      stitched.map((p) => p.t),
      [1000, 2000, 3000, 4000]
    );
  });

  it("interpola geometria com timestamps entre o primeiro e o último ponto", () => {
    const source = [pt(-23.55, -46.63, 10_000, 15), pt(-23.56, -46.64, 20_000, 15)];
    const line: Array<[number, number]> = [
      [-46.63, -23.55],
      [-46.635, -23.555],
      [-46.64, -23.56]
    ];
    const out = interpolateMatchedGeometry(line, source);
    assert.equal(out.length, 3);
    assert.equal(out[0].t, 10_000);
    assert.equal(out[2].t, 20_000);
    assert.ok(out[1].t > 10_000 && out[1].t < 20_000);
  });

  it("devolve o GPS bruto quando não há token", async () => {
    const points = [pt(-23.55, -46.63, 1), pt(-23.551, -46.631, 2000)];
    const result = await matchActivityToRoads("RUN", points, { token: "" });
    assert.equal(result.matched, false);
    assert.equal(result.points, points);
  });

  it("marca matched quando o Mapbox devolve geometria Ok", async () => {
    const points = [pt(-23.55, -46.63, 1_000), pt(-23.551, -46.631, 5_000)];
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          code: "Ok",
          matchings: [
            {
              confidence: 0.9,
              geometry: {
                type: "LineString",
                coordinates: [
                  [-46.6301, -23.5501],
                  [-46.6311, -23.5511]
                ]
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    const result = await matchActivityToRoads("RUN", points, { token: "pk.test", fetchImpl });
    assert.equal(result.matched, true);
    assert.ok(result.confidence >= 0.9);
    assert.equal(result.points.length, 2);
    assert.ok(Math.abs(result.points[0].lng + 46.6301) < 0.00001);
  });

  it("mantém o bruto se a maioria dos chunks falhar", async () => {
    const points = Array.from({ length: 8 }, (_, i) => pt(-23.55, -46.63 + i * 0.001, (i + 1) * 1000));
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ code: "NoMatch" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    const result = await matchActivityToRoads("WALK", points, { token: "pk.test", fetchImpl });
    assert.equal(result.matched, false);
    assert.equal(result.points, points);
  });
});
