# Coach Pro — permissões, pagamentos e alunos gerenciados

## Coach (profissional)

1. **Landing** — `/para-coaches` (CTA → plano `COACH_PRO_ANNUAL`).
2. **Pagamento** — assinatura anual **R$ 1.300** (`COACH_PRO_ANNUAL`, criado/atualizado via API ao listar planos).
3. **Organização** — continua exigindo vínculo `COACH` ativo na organização (promoção admin) + assinatura (plano Coach Pro ou matrícula aluno legada).
4. **Cadastro de alunos** — `POST /org/coach-athletes/register` (permissão `athletes.create`).

## Aluno gerenciado (`COACH_MANAGED`)

- Criado pelo coach; `enrollmentStatus: ACTIVE` **sem** checkout B2C.
- **Liberado:** treinos prescritos pelo coach, corrida/caminhada/bike, programas fixos ATLLY, histórico.
- **Fechado no portal:** loja, IA, social, cartões, vitrine, etc. (`COACH_MANAGED_MODULE_OVERRIDES`).
- **API:** `listUserPlanFeatures` retorna subset `COACH_MANAGED_PLAN_FEATURES`.
- **Web:** `GET /user/portal-config` aplica overrides de módulos.

## Próximos passos (produto)

- UI no painel Coach para cadastrar aluno (form → `/org/coach-athletes/register`).
- Bloquear checkout `/ativar` para perfil `COACH_MANAGED` com mensagem clara.
- Landing page customizável por coach (slug público).
