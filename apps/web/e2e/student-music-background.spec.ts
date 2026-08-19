import { expect, test } from "@playwright/test";

const studentEmail = process.env.E2E_STUDENT_EMAIL ?? "teste@gmail.com";
const studentPassword = process.env.E2E_STUDENT_PASSWORD ?? "Teste@123";

async function loginStudent(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator('input[name="identifier"]').fill(studentEmail);
  await page.locator('input[name="password"]').fill(studentPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/aluno\/?$/, { timeout: 30_000 });
}

test.describe("Música em segundo plano e área do aluno", () => {
  test("toca uma faixa, sai do Play e a música continua no dock", async ({ page }) => {
    await loginStudent(page);

    await page.locator(".student-bottom-nav").getByRole("button", { name: "Play" }).click();
    await expect(page.locator(".student-play-shell")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Carregando sua trilha...")).toHaveCount(0, { timeout: 20_000 });

    const listenNow = page.getByRole("button", { name: /Ouvir agora/i });
    const hasCatalog = await listenNow.isVisible().catch(() => false);
    if (!hasCatalog) {
      test.skip(true, "Catálogo de música vazio neste ambiente.");
    }

    await listenNow.click();

    const mini = page.getByTestId("student-music-mini");
    await expect(mini).toBeVisible({ timeout: 20_000 });
    await expect(mini).toHaveClass(/is-playing/, { timeout: 15_000 });
    const title = (await page.getByTestId("student-music-mini-meta").locator("strong").textContent())?.trim();
    expect(title && title.length > 0).toBeTruthy();

    await page.locator(".student-bottom-nav").getByRole("button", { name: "Home" }).click();
    await expect(page.getByTestId("student-music-mini")).toBeVisible();
    await expect(page.getByTestId("student-music-mini")).toHaveClass(/is-playing/);
    await expect(page.getByTestId("student-music-mini-meta").locator("strong")).toHaveText(title ?? "");
  });

  test("abre o player de treino com a barra de música visível", async ({ page }) => {
    await loginStudent(page);

    const continueWorkout = page.getByRole("button", { name: "Continuar treino" });
    if (await continueWorkout.isVisible().catch(() => false)) {
      await continueWorkout.click();
      await expect(page.getByTestId("workout-music-bar")).toBeVisible({ timeout: 20_000 });
      return;
    }

    await page.locator(".student-bottom-nav").getByRole("button", { name: "Treino" }).click();
    const openWorkout = page.getByRole("button", { name: "Abrir treino" }).first();
    const modalityCard = page.locator(".student-training-card, .student-program-card").first();
    const hasModality = await modalityCard.isVisible({ timeout: 8_000 }).catch(() => false);
    if (!hasModality && !(await openWorkout.isVisible().catch(() => false))) {
      test.skip(true, "Aluno de teste sem treino publicado.");
    }

    if (!(await openWorkout.isVisible().catch(() => false))) {
      await modalityCard.click();
    }

    if (await openWorkout.isVisible().catch(() => false)) {
      await openWorkout.click();
    }

    const startSession = page.getByRole("button", { name: "Iniciar sessão" });
    const canStart = await startSession.isVisible({ timeout: 8_000 }).catch(() => false);
    if (!canStart) {
      test.skip(true, "Nenhuma sessão liberada para iniciar.");
    }

    await startSession.click();
    await expect(page.getByTestId("workout-music-bar")).toBeVisible({ timeout: 20_000 });
  });
});
