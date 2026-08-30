import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  GEO_TICK_MS,
  haversineMeters,
  HOME,
  JULIA_SEFFER,
  JULIA_SEFFER_LOOP,
  LOOP_DISTANCE_M
} from "./fixtures/julia-seffer-loop";

const apiBaseUrl = process.env.E2E_API_URL ?? "http://localhost:3333";
const studentEmail = process.env.E2E_STUDENT_EMAIL ?? "teste@gmail.com";
const studentPassword = process.env.E2E_STUDENT_PASSWORD ?? "Teste@123";

type FinishPayload = {
  activity?: {
    id?: string;
    distanceMeters?: number;
    polyline?: Array<{ lat: number; lng: number }>;
    roadMatched?: boolean;
    status?: string;
  };
};

async function studentToken(page: Page) {
  return page.evaluate(() => window.localStorage.getItem("app-treino-token"));
}

async function discardActivity(page: Page, request: APIRequestContext, id: string | undefined) {
  try {
    const token = await studentToken(page);
    if (!token || !id) return;
    await request.delete(`${apiBaseUrl}/student/activities/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch {
    /* cleanup não pode falhar o teste */
  }
}

async function resetStudentOutdoor(page: Page, request: APIRequestContext) {
  try {
    const token = await studentToken(page);
    if (!token) return;
    const auth = { Authorization: `Bearer ${token}` };
    const live = await request.get(`${apiBaseUrl}/student/activities/live`, { headers: auth });
    if (live.ok()) {
      const body = (await live.json()) as { activity?: { id?: string } };
      if (body.activity?.id) {
        await request.post(`${apiBaseUrl}/student/activities/${body.activity.id}/cancel`, {
          headers: auth,
          data: {}
        });
      }
    }
    const recent = await request.get(`${apiBaseUrl}/student/activities/recent`, { headers: auth });
    if (!recent.ok()) return;
    const list = (await recent.json()) as {
      activities?: Array<{ id: string; status: string; published?: boolean }>;
    };
    for (const row of list.activities ?? []) {
      if (row.published) continue;
      if (row.status !== "CANCELED" && row.status !== "COMPLETED" && row.status !== "LIVE" && row.status !== "PAUSED") {
        continue;
      }
      await request.delete(`${apiBaseUrl}/student/activities/${row.id}`, { headers: auth });
    }
  } catch {
    /* cleanup não pode falhar o teste */
  }
}

async function loginStudent(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="identifier"]').fill(studentEmail);
  await page.locator('input[name="password"]').fill(studentPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/aluno\/?$/, { timeout: 30_000 });
}

async function cancelLiveActivity(page: Page, request: APIRequestContext) {
  await resetStudentOutdoor(page, request);
}

async function installGeoMock(page: Page) {
  await page.addInitScript(() => {
    const key = `app-treino-motivation-seen-${new Date().toISOString().slice(0, 10)}`;
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* private mode */
    }
  });
  await page.addInitScript(
    ({ route }) => {
      let index = 0;
      const watchers = new Set();

      function positionAt(i) {
        const point = route[Math.min(Math.max(i, 0), route.length - 1)];
        return {
          coords: {
            latitude: point.lat,
            longitude: point.lng,
            accuracy: 10,
            altitude: 18,
            altitudeAccuracy: 4,
            heading: 90,
            speed: 2.6
          },
          timestamp: Date.now()
        };
      }

      function notify() {
        const pos = positionAt(index);
        watchers.forEach((cb) => cb(pos));
      }

      navigator.geolocation.getCurrentPosition = (success) => {
        success(positionAt(index));
      };
      navigator.geolocation.watchPosition = (success) => {
        watchers.add(success);
        success(positionAt(index));
        return 1;
      };
      navigator.geolocation.clearWatch = () => {
        watchers.clear();
      };

      window.__e2eGeo = {
        length: route.length,
        push() {
          if (index < route.length - 1) index += 1;
          notify();
          return index;
        }
      };
    },
    { route: JULIA_SEFFER_LOOP }
  );
}

test.describe("Corrida ida e volta Júlia Seffer", () => {
  test.use({
    geolocation: { latitude: HOME.lat, longitude: HOME.lng },
    locale: "pt-BR",
    permissions: ["geolocation"]
  });

  test("grava o traçado completo da casa ao conjunto e de volta", async ({ page, request }) => {
    test.setTimeout(180_000);
    await installGeoMock(page);
    await loginStudent(page);

    if (await page.getByText(/Assine agora|Conteúdos bloqueados|treino esta bloqueado/i).isVisible().catch(() => false)) {
      test.skip(true, "Aluno de teste sem área de corrida liberada.");
    }

    await cancelLiveActivity(page, request);
    let activityId: string | undefined;
    try {
      const motivation = page.getByRole("button", { name: /Entendi/i });
      await motivation.click({ timeout: 3_000 }).catch(() => undefined);
      await expect(page.locator(".student-motivation-backdrop")).toHaveCount(0);

      await page.locator(".student-bottom-nav").getByRole("button", { name: "Corrida" }).click();
      await expect(page.getByRole("button", { name: "Iniciar" })).toBeVisible({ timeout: 20_000 });

      await page.getByRole("button", { name: "Iniciar" }).click();
      await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible({ timeout: 25_000 });

      const ticks = JULIA_SEFFER_LOOP.length - 1;
      for (let i = 0; i < ticks; i += 1) {
        await page.evaluate("window.__e2eGeo && window.__e2eGeo.push()");
        await page.waitForTimeout(GEO_TICK_MS);
      }

      const liveDistance = page.locator(".student-activity-card .student-activity-stats").first().locator("strong").nth(2);
      await expect(liveDistance).not.toHaveText("0.00", { timeout: 15_000 });

      const finishWait = page.waitForResponse(
        (res) => res.url().includes("/student/activities/") && res.url().includes("/finish") && res.request().method() === "POST",
        { timeout: 60_000 }
      );
      await page.getByRole("button", { name: "Finalizar sem publicar" }).click();
      const finishRes = await finishWait;
      expect(finishRes.ok(), `finish falhou: ${finishRes.status()}`).toBeTruthy();
      const payload = (await finishRes.json()) as FinishPayload;
      activityId = payload.activity?.id;
      const polyline = payload.activity?.polyline ?? [];
      const distance = payload.activity?.distanceMeters ?? 0;

      expect(polyline.length, "polyline precisa ter o percurso do início ao fim").toBeGreaterThan(8);
      expect(distance).toBeGreaterThan(LOOP_DISTANCE_M * 0.55);
      expect(distance).toBeLessThan(LOOP_DISTANCE_M * 1.6);

      const start = polyline[0];
      const end = polyline[polyline.length - 1];
      expect(haversineMeters(start, HOME)).toBeLessThan(90);
      expect(haversineMeters(end, HOME)).toBeLessThan(90);
      const reachedEast = polyline.some((point) => haversineMeters(point, JULIA_SEFFER) < 80);
      expect(reachedEast, "o traço precisa chegar no Júlia Seffer").toBeTruthy();

      const saved = page.getByRole("dialog", { name: "Atividade salva" });
      await expect(saved).toBeVisible({ timeout: 20_000 });
      await expect(saved).not.toContainText("0.00 km");
      await expect(page.locator(".student-activity-map iframe")).toBeVisible();

      await saved.getByRole("button", { name: "Nova atividade" }).click();
      await expect(saved).toHaveCount(0);
    } finally {
      await discardActivity(page, request, activityId);
      await resetStudentOutdoor(page, request);
    }
  });
});
