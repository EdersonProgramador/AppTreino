import { expect, test } from "@playwright/test";

const studentEmail = process.env.E2E_STUDENT_EMAIL ?? "teste@gmail.com";
const studentPassword = process.env.E2E_STUDENT_PASSWORD ?? "Teste@123";

test.describe("Login aluno", () => {
  test("teste@gmail.com entra direto em /aluno sem painel admin", async ({ page }) => {
    await page.goto("/login");

    await page.locator('input[name="identifier"]').fill(studentEmail);
    await page.locator('input[name="password"]').fill(studentPassword);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/aluno\/?$/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/admin/);
    await expect(page.locator("text=Painel Admin").or(page.locator("text=Estúdio de Treinos"))).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Assine agora/i })).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText(/Conteúdos bloqueados/i)).toHaveCount(0);
  });

  test("credencial inválida permanece em /login com mensagem clara", async ({ page }) => {
    await page.goto("/login");

    await page.locator('input[name="identifier"]').fill(studentEmail);
    await page.locator('input[name="password"]').fill("senha-errada-xyz");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator(".ui-error")).toContainText(/Senha incorreta|e-mail|telefone|inválid/i);
    await expect(page).not.toHaveURL(/\/aluno|\/admin|^\/$/);
  });
});
