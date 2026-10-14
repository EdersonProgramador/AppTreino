# Google Ads — conta ATLLY

| Campo | Valor |
|--------|--------|
| **Nome** | ATLLY (conta dedicada ao produto) |
| **Customer ID** | `244-230-6941` (API: `2442306941`) |
| **Site de conversão** | `https://atlly.com.br` |
| **Landing de venda** | `https://atlly.com.br/ativar` |

A **Customer ID** identifica a conta no Google Ads e no Adrails. A **tag de conversão** usada no site é o par **`AW-XXXXXXXXX`** + **rótulo** (copiados em **Objetivos → Conversões → [ação] → Configuração da tag**).

## Vercel (Production)

Defina no projeto **atlly**:

```txt
VITE_GOOGLE_ADS_CUSTOMER_ID=244-230-6941
VITE_GOOGLE_ADS_ID=AW-XXXXXXXXX
VITE_GOOGLE_ADS_CONVERSION_PURCHASE=<rótulo>
VITE_GOOGLE_ADS_CONVERSION_SIGNUP=<rótulo>
VITE_GOOGLE_ADS_CONVERSION_BEGIN_CHECKOUT=<rótulo>
VITE_GA4_MEASUREMENT_ID=G-XXXXXXXXXX
```

O `VITE_GOOGLE_ADS_ID` deve ser o **AW-… desta conta (244-230-6941)**, não de outra conta (ex.: Baruc Shopping).

Redeploy após salvar. Valide com [Tag Assistant](https://tagassistant.google.com/) em `/ativar`.

## Adrails + Cursor

1. No [Adrails](https://adrails.ai), conecte a conta Google Ads **244-230-6941**.
2. O repo já inclui `.cursor/mcp.json` com o servidor Adrails.
3. No Cursor: **Settings → MCP** → autentique no Adrails e escolha o workspace com a conta ATLLY.
4. No chat do Agent: *“Listar contas Google Ads e confirmar customer id 244-230-6941”* ou *“Performance últimos 7 dias”*.

## URL padrão de campanha

```text
https://atlly.com.br/ativar?plan=PRO&coupon=GOOGLE15&utm_source=google&utm_medium=paid_search&utm_campaign=atlly_pro_br
```

Cupom `GOOGLE15` (ou equivalente) deve existir no admin ATLLY antes de publicar anúncios.
