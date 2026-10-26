# Google Ads — conta ATLLY

**Operação manual (sem ferramentas pagas):** [google-ads-manual-playbook.md](./google-ads-manual-playbook.md)

**API + OAuth (scripts locais):** [google-ads-api-oauth.md](./google-ads-api-oauth.md)

| Campo | Valor |
|--------|--------|
| **Nome** | ATLLY (conta dedicada ao produto) |
| **Customer ID** | `244-230-6941` (API: `2442306941`) |
| **Google tag (gtag)** | `AW-18513371658` |
| **Site de conversão** | `https://atlly.com.br` |
| **Landing de venda** | `https://atlly.com.br/ativar` |

A **Customer ID** identifica a conta no Google Ads e no Adrails. A **tag de conversão** usada no site é o par **`AW-XXXXXXXXX`** + **rótulo** (copiados em **Objetivos → Conversões → [ação] → Configuração da tag**).

## Vercel (Production)

Defina no projeto **atlly**:

```txt
VITE_GOOGLE_ADS_CUSTOMER_ID=244-230-6941
VITE_GOOGLE_ADS_ID=AW-18513371658
VITE_GOOGLE_ADS_CONVERSION_PURCHASE=<rótulo>
VITE_GOOGLE_ADS_CONVERSION_SIGNUP=<rótulo>
VITE_GOOGLE_ADS_CONVERSION_BEGIN_CHECKOUT=<rótulo>
VITE_GA4_MEASUREMENT_ID=G-XXXXXXXXXX
```

O `VITE_GOOGLE_ADS_ID` deve ser o **AW-… desta conta (244-230-6941)**, não de outra conta (ex.: Baruc Shopping).

Redeploy após salvar. Valide com [Tag Assistant](https://tagassistant.google.com/) em `/ativar`.

**Importante:** não use texto placeholder (`<rótulo da compra>`) na Vercel — o build ignora rótulos inválidos e só dispara eventos `purchase` / `sign_up` / `begin_checkout` até você colar o rótulo real do Google Ads.

### Conversão automática por URL (sem rótulo no código)

No Google Ads → Conversões → Nova → **Site** → **Visualização de página**:

| Conversão | URL contém |
|-----------|------------|
| Assinatura ativa | `/aluno` |

Funciona só com a tag `AW-18513371658` já instalada.

A tag **`AW-18513371658`** está no `apps/web/index.html` para o verificador do Google Ads ler o HTML estático. O app reutiliza o mesmo `gtag` para eventos de funil (sem carregar o script duas vezes).

## Automação no repo

```bash
npm run marketing:campaign-pack   # gera docs/google-ads/generated/campaign-pack.json + final-urls.txt
npm run marketing:verify          # smoke: tag AW-*, API health, bundle Vercel
npm run marketing:check           # testes shared + verify produção
```

CI: workflow **Marketing smoke** (diário + push em arquivos de marketing).

URLs finais e prompts Adrails ficam em `docs/google-ads/generated/campaign-pack.json`.

## Adrails + Cursor

1. No [Adrails](https://adrails.ai/home), conecte a conta Google Ads **244-230-6941** e aguarde **first read** no Home.
2. O repo já inclui `.cursor/mcp.json` com o servidor Adrails.
3. No Cursor: **Settings → MCP** → autentique no Adrails e escolha o workspace com a conta ATLLY.
4. No chat **Adly** (Adrails) ou no Cursor Agent, use os prompts em `campaign-pack.json` → `adrailsPrompts`.

Exemplo no Adrails após a sync:

```text
Review Google Ads account 2442306941 (ATLLY). List conversion actions for tag AW-18513371658, active campaigns, spend last 7 days. Then prepare a paused Performance Max for Brazil with final URL from our campaign pack (atlly_pro_pmax_br).
```

## URL padrão de campanha

```text
https://atlly.com.br/ativar?plan=PRO&coupon=GOOGLE15&utm_source=google&utm_medium=paid_search&utm_campaign=atlly_pro_br
```

Cupom `GOOGLE15` (ou equivalente) deve existir no admin ATLLY antes de publicar anúncios.
