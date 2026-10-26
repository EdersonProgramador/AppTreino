# Coach Pro — permissões, pagamentos e alunos gerenciados

## Coach (profissional)

1. **Landing** — `/para-coaches` (CTA → plano `COACH_PRO_ANNUAL`).
2. **Pagamento** — assinatura anual **R$ 1.300** (`COACH_PRO_ANNUAL`).
3. **Organização** — vínculo `COACH` ativo + assinatura Coach Pro (ou matrícula aluno legada).
4. **Cadastro de alunos** — manual ou link de convite (`/org/coach-athletes/*`).

## Aluno gerenciado (`COACH_MANAGED`)

- Criado pelo coach ou convite; **sexo biológico** obrigatório no cadastro; **sem** funil `/ativar` no onboarding.
- `enrollmentStatus: ACTIVE` libera **portal** e treinos **org/coach** (programas `ORGANIZATION` / `COACH` via vínculo).
- **Catálogo ATLLY** (`PLATFORM`) e **corrida/caminhada/bike** exigem **assinatura B2C** (`membership` + features do plano).
- **Fechado no portal:** loja, IA, social, cartões, etc. (`COACH_MANAGED_MODULE_OVERRIDES`).
- **API:** `listUserPlanFeatures` = base vazia + features do plano se houver membership; `getPublishedWorkouts` só inclui `PLATFORM` com `fixed_training_programs`.
- **Checkout:** aluno coach **pode** assinar na área do aluno (aba Assinatura).
