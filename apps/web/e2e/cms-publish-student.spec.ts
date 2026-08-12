import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const apiBaseUrl = process.env.E2E_API_URL ?? "http://localhost:3333";
const studentEmail = process.env.E2E_STUDENT_EMAIL ?? "teste@gmail.com";
const studentPassword = process.env.E2E_STUDENT_PASSWORD ?? "Teste@123";
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "admin@apptreino.com";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "Admin@123";

async function loginUi(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[name="identifier"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function apiLogin(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${apiBaseUrl}/auth/login`, {
    data: { email, password, provider: "EMAIL" }
  });
  expect(response.ok(), `login ${email} failed: ${await response.text()}`).toBeTruthy();
  const body = (await response.json()) as { token: string };
  return body.token;
}

test.describe("CMS Modalidades → Exercícios → Divisões → Publicar", () => {
  test("admin percorre o fluxo CMS sem erros e aluno recebe o treino publicado", async ({ page, request }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const programTitle = `E2E Treino ${stamp}`;

    // 1) Login admin e navegar etapas do estúdio
    await loginUi(page, adminEmail, adminPassword);
    await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 30_000 });
    await expect(page.locator(".error-box, .ui-error")).toHaveCount(0);

    await page.getByRole("button", { name: "Estúdio de Treinos", exact: true }).click();
    await expect(page.getByTestId("cms-step-modalities")).toBeVisible({ timeout: 15_000 });

    for (const step of ["modalities", "lessons", "blocks", "publish"] as const) {
      await page.getByTestId(`cms-step-${step}`).click();
      await expect(page.getByTestId(`cms-step-${step}`)).toHaveClass(/active/);
      await expect(page.locator(".error-box")).toHaveCount(0);
    }

    // 2) Publicar via API usando catálogo existente (evita formulários longos flaky)
    const adminToken = await apiLogin(request, adminEmail, adminPassword);
    const auth = { Authorization: `Bearer ${adminToken}` };

    const modalitiesRes = await request.get(`${apiBaseUrl}/admin/cms/modalities`, { headers: auth });
    expect(modalitiesRes.ok()).toBeTruthy();
    const modalities = (await modalitiesRes.json()) as { modalities: Array<{ id: string; isActive: boolean }> };
    const modalityId = modalities.modalities.find((item) => item.isActive)?.id;
    expect(modalityId, "precisa existir modalidade ativa").toBeTruthy();

    const exercisesRes = await request.get(`${apiBaseUrl}/admin/cms/exercises`, { headers: auth });
    expect(exercisesRes.ok()).toBeTruthy();
    const exercises = (await exercisesRes.json()) as { exercises: Array<{ id: string }> };
    expect(exercises.exercises.length, "precisa existir exercício").toBeGreaterThan(0);

    const blocksRes = await request.get(`${apiBaseUrl}/admin/cms/workout-blocks`, { headers: auth });
    expect(blocksRes.ok()).toBeTruthy();
    const blocks = (await blocksRes.json()) as { workoutBlocks: Array<{ id: string; deletedAt?: string | null }> };
    let blockId = blocks.workoutBlocks.find((item) => !item.deletedAt)?.id;

    if (!blockId) {
      const createBlock = await request.post(`${apiBaseUrl}/admin/cms/workout-blocks`, {
        headers: auth,
        data: {
          title: `E2E Divisão ${stamp}`,
          modalityId,
          structureType: "NORMAL",
          restTime: 60,
          exercises: [
            {
              exerciseId: exercises.exercises[0].id,
              order: 1,
              sets: 3,
              repsMin: 8,
              repsMax: 12,
              repsRange: "8-12",
              prescriptionType: "REPETITIONS"
            }
          ]
        }
      });
      expect(createBlock.ok(), await createBlock.text()).toBeTruthy();
      const createdBlock = (await createBlock.json()) as { workoutBlock: { id: string } };
      blockId = createdBlock.workoutBlock.id;
    }

    const createProgram = await request.post(`${apiBaseUrl}/admin/cms/programs`, {
      headers: auth,
      data: {
        title: programTitle,
        description: "Programa E2E publicado para validar comunicação com aluno",
        modalityId,
        status: "DRAFT",
        audienceMode: "ALL_ACTIVE",
        targetGender: "ALL",
        durationWeeks: 4,
        plannedSessions: 3,
        totalWorkouts: 3,
        cycleLengthDays: 7,
        days: [{ dayNumber: 1, order: 1, workoutBlockId: blockId }]
      }
    });
    expect(createProgram.ok(), await createProgram.text()).toBeTruthy();
    const createdProgram = (await createProgram.json()) as { program: { id: string; title: string } };

    await page.getByRole("button", { name: "Atualizar" }).click();
    await page.getByRole("button", { name: "Estúdio de Treinos", exact: true }).click();
    await page.getByTestId("cms-step-publish").click();
    await expect(page.locator(".cms-program-card").filter({ hasText: programTitle }).first()).toBeVisible({
      timeout: 20_000
    });

    // Publicação confirmada via API (mesmo endpoint do botão Publicar) para evitar flakiness do accordion CSS.
    const publishRes = await request.post(`${apiBaseUrl}/admin/cms/programs/${createdProgram.program.id}/publish`, {
      headers: auth
    });
    expect(publishRes.ok(), await publishRes.text()).toBeTruthy();

    await page.getByRole("button", { name: "Atualizar" }).click();
    await page.getByRole("button", { name: "Estúdio de Treinos", exact: true }).click();
    await page.getByTestId("cms-step-publish").click();
    await expect(page.locator(".cms-program-card").filter({ hasText: programTitle }).first()).toContainText(/Publicado|PUBLISHED|Publicado/i);

    // Sanity: programa ficou PUBLISHED e atribuído
    const programCheck = await request.get(`${apiBaseUrl}/admin/cms/programs`, { headers: auth });
    expect(programCheck.ok()).toBeTruthy();
    const programsPayload = (await programCheck.json()) as {
      programs: Array<{ id: string; status: string; title: string }>;
    };
    const published = programsPayload.programs.find((item) => item.id === createdProgram.program.id);
    expect(published?.status).toBe("PUBLISHED");

    // 3) Aluno ativo vê o programa e a comunicação de treino
    await page.context().clearCookies();
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await loginUi(page, studentEmail, studentPassword);
    await expect(page).toHaveURL(/\/aluno\/?$/, { timeout: 30_000 });
    await expect(page.getByText(/Assine agora/i)).toHaveCount(0);

    await page.getByRole("button", { name: /^Treino$/i }).click();
    const modalityCard = page.locator(".student-modality-card").first();
    await expect(modalityCard).toBeVisible({ timeout: 20_000 });
    await modalityCard.click();
    await expect(page.getByText(programTitle).first()).toBeVisible({ timeout: 30_000 });

    const studentToken = await apiLogin(request, studentEmail, studentPassword);
    const studentPrograms = await request.get(`${apiBaseUrl}/student/workout/programs`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(studentPrograms.ok()).toBeTruthy();
    const studentCatalog = (await studentPrograms.json()) as {
      workouts: Array<{ programTitle?: string; programId?: string }>;
    };
    expect(
      studentCatalog.workouts.some(
        (item) => item.programTitle === programTitle || item.programId === createdProgram.program.id
      )
    ).toBeTruthy();

    const notifications = await request.get(`${apiBaseUrl}/user/notifications`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(notifications.ok()).toBeTruthy();
    const notificationPayload = (await notifications.json()) as {
      notifications: Array<{ type: string; message: string; title: string }>;
    };
    expect(
      notificationPayload.notifications.some(
        (item) => item.type === "WORKOUT_PROGRAM" && item.message.includes(programTitle)
      )
    ).toBeTruthy();
  });

  test("publicar divisão avulsa libera o treino na modalidade correta do aluno", async ({ request }) => {
    test.setTimeout(60_000);
    const stamp = Date.now();
    const blockTitle = `E2E Divisão Pub ${stamp}`;

    const adminToken = await apiLogin(request, adminEmail, adminPassword);
    const auth = { Authorization: `Bearer ${adminToken}` };

    const modalitiesRes = await request.get(`${apiBaseUrl}/admin/cms/modalities`, { headers: auth });
    expect(modalitiesRes.ok()).toBeTruthy();
    const modalities = (await modalitiesRes.json()) as {
      modalities: Array<{ id: string; name: string; isActive: boolean }>;
    };
    const modality = modalities.modalities.find((item) => item.isActive);
    expect(modality, "precisa existir modalidade ativa").toBeTruthy();

    const exercisesRes = await request.get(`${apiBaseUrl}/admin/cms/exercises`, { headers: auth });
    expect(exercisesRes.ok()).toBeTruthy();
    const exercises = (await exercisesRes.json()) as {
      exercises: Array<{ id: string; modalityLinks?: Array<{ modality: { id: string } }> }>;
    };
    const exercise =
      exercises.exercises.find((item) =>
        (item.modalityLinks ?? []).some((link) => link.modality.id === modality!.id)
      ) ?? exercises.exercises[0];
    expect(exercise, "precisa existir exercício").toBeTruthy();

    const createBlock = await request.post(`${apiBaseUrl}/admin/cms/workout-blocks`, {
      headers: auth,
      data: {
        title: blockTitle,
        modalityId: modality!.id,
        structureType: "NORMAL",
        restTime: 60,
        weeklyFrequency: 3,
        exercises: [
          {
            exerciseId: exercise!.id,
            order: 1,
            sets: 3,
            repsMin: 8,
            repsMax: 12,
            repsRange: "8-12",
            prescriptionType: "REPETITIONS"
          }
        ]
      }
    });
    expect(createBlock.ok(), await createBlock.text()).toBeTruthy();
    const createdBlock = (await createBlock.json()) as { workoutBlock: { id: string } };

    const publishBlock = await request.post(
      `${apiBaseUrl}/admin/cms/workout-blocks/${createdBlock.workoutBlock.id}/publish`,
      {
        headers: auth,
        data: {
          title: blockTitle,
          targetGender: "ALL",
          audienceMode: "ALL_ACTIVE",
          durationWeeks: 4
        }
      }
    );
    expect(publishBlock.ok(), await publishBlock.text()).toBeTruthy();
    const published = (await publishBlock.json()) as {
      program: { id: string; title: string; modalityId: string };
    };
    expect(published.program.modalityId).toBe(modality!.id);

    const studentToken = await apiLogin(request, studentEmail, studentPassword);
    const studentPrograms = await request.get(`${apiBaseUrl}/student/workout/programs`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(studentPrograms.ok()).toBeTruthy();
    const studentCatalog = (await studentPrograms.json()) as {
      workouts: Array<{ programTitle?: string; programId?: string; modality?: string }>;
    };
    const received = studentCatalog.workouts.find(
      (item) => item.programId === published.program.id || item.programTitle === blockTitle
    );
    expect(received).toBeTruthy();
    expect(received?.modality).toBe(modality!.name);
  });
});
