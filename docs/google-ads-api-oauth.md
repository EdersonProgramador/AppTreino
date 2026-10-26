# Google Ads API + OAuth (conta ATLLY)

Conta **244-230-6941** (`2442306941`) · Tag site **AW-18513371658**

Use a API **no seu PC** (scripts em `scripts/google-ads/`). **Não** coloque `GOOGLE_ADS_REFRESH_TOKEN` na Vercel nem no Render — isso é credencial de servidor com permissão de anúncios.

---

## 1. Google Cloud (projeto ATLLY)

1. [Google Cloud Console](https://console.cloud.google.com/) → mesmo projeto do login Google do app (ou projeto novo).
2. **APIs & Services → Library** → ative **Google Ads API**.
3. **OAuth consent screen**
   - Tipo: **External** (ou Internal se Workspace).
   - Adicione escopo: `https://www.googleapis.com/auth/adwords`
   - Usuário de teste: seu e-mail Google que administra a conta Ads ATLLY.
4. **Credentials → Create credentials → OAuth client ID**
   - Tipo recomendado: **Web application** (ou Desktop).
   - **Authorized redirect URIs:**
     ```text
     http://127.0.0.1:8721/oauth2callback
     ```
5. Copie **Client ID** e **Client secret**.

> Pode reutilizar o OAuth do login (`GOOGLE_CLIENT_ID`) **somente se** você adicionar o redirect acima e o escopo `adwords` no consent. Para isolar, crie um client só para Ads.

---

## 2. Google Ads — token de desenvolvedor

1. [Google Ads](https://ads.google.com) → **Ferramentas e configurações** → **Configuração** → **Centro da API**.
2. Solicite **Developer token** (modo teste libera contas de teste; produção exige aprovação do Google).
3. Anote o token (formato alfanumérico).

Conta de acesso: e-mail que é **Admin** na **244-230-6941**.

Se a ATLLY estiver dentro de um **MCC**, defina também `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (ID do manager, só dígitos).

---

## 3. Configurar env local

```bash
cd scripts/google-ads
cp env.example .env
```

Edite `.env`:

```txt
GOOGLE_ADS_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_ADS_CLIENT_SECRET=....
GOOGLE_ADS_DEVELOPER_TOKEN=....
GOOGLE_ADS_CUSTOMER_ID=2442306941
# GOOGLE_ADS_LOGIN_CUSTOMER_ID=1234567890
```

Instale dependências (uma vez):

```bash
npm install
# ou na raiz: npm run google-ads:install
```

---

## 4. Gerar refresh token (OAuth)

```bash
npm run google-ads:oauth
```

1. O script abre o browser → login Google → **Allow**.
2. Copie a linha `GOOGLE_ADS_REFRESH_TOKEN=...` para `scripts/google-ads/.env`.

Alternativa: salve tudo em `.env.google-ads.local` na **raiz** do repo (também gitignored).

---

## 5. Testar API

```bash
npm run google-ads:list-conversions
npm run google-ads:list-campaigns
```

Se der `DEVELOPER_TOKEN_NOT_APPROVED`, o token ainda está em teste — use conta de teste ou aguarde aprovação.

Erros comuns:

| Erro | Ação |
|------|------|
| `redirect_uri_mismatch` | Cadastre `http://127.0.0.1:8721/oauth2callback` no OAuth client |
| `access_denied` | E-mail logado não é admin da conta 2442306941 |
| `USER_PERMISSION_DENIED` | Developer token ou login customer ID incorreto |
| Sem refresh token | Revogue app em [Conta Google → Segurança → Apps](https://myaccount.google.com/permissions) e rode OAuth de novo |

---

## 6. Scripts npm (raiz)

| Comando | Função |
|---------|--------|
| `npm run google-ads:install` | `npm install` em `scripts/google-ads` |
| `npm run google-ads:oauth` | Gera refresh token |
| `npm run google-ads:list-campaigns` | Campanhas + métricas 30d |
| `npm run google-ads:list-conversions` | Ações de conversão |

---

## 7. Próximo passo (campanhas via API)

Com OAuth ok, dá para evoluir scripts (`create-search-campaign.mjs`) usando [google-ads-api](https://www.npmjs.com/package/google-ads-api). Campanhas criadas via API devem ir **PAUSED** até revisão manual — alinhado ao [playbook manual](./google-ads-manual-playbook.md) e [100 assinaturas](./google-ads/campaign-search-100-assinaturas.md).

Documentação oficial: [Google Ads API — OAuth](https://developers.google.com/google-ads/api/docs/oauth/overview).
