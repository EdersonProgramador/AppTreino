# Google Ads ATLLY — playbook manual (sem Adrails)

Conta **244-230-6941** · Tag **AW-18513371658** · Site **www.atlly.com.br**

Use este roteiro no [Google Ads](https://ads.google.com). Mensuração no site já está configurada; conversão recomendada: **página contém `/aluno`**.

---

## Antes de criar campanha

| # | Ação | Onde |
|---|------|------|
| 1 | Tag **Detectada** | Metas → Conversões → Detalhes da tag |
| 2 | Conversão **Assinatura / `/aluno`** criada e **Primária** | Metas → Conversões |
| 3 | Cupom **GOOGLE15** ativo (se usar na URL) | Admin ATLLY |
| 4 | Smoke local | `npm run marketing:verify` |

**URL final (copiar):**

```text
https://www.atlly.com.br/ativar?plan=PRO&utm_source=google&utm_medium=paid_search&utm_campaign=atlly_pro_br
```

Com cupom (opcional):

```text
https://www.atlly.com.br/ativar?plan=PRO&coupon=GOOGLE15&utm_source=google&utm_medium=paid_search&utm_campaign=atlly_pro_br
```

Mais variantes: `docs/google-ads/generated/final-urls.txt` (`npm run marketing:campaign-pack`).

---

## Search vs Performance Max — qual começar?

| | **Search (recomendado para 1ª campanha)** | **Performance Max** |
|---|-------------------------------------------|---------------------|
| Controle | Palavras-chave, anúncios, termos de pesquisa | Google distribui em vários canais |
| Aprendizado | Mais previsível para funil `/ativar` | Precisa de conversões/histórico para otimizar bem |
| Orçamento teste | **R$ 30–50/dia** | **R$ 50–80/dia** (mínimo útil costuma ser maior) |
| Quando usar | Validar intenção (“app treino”, “planilha treino”, marca) | Escalar depois de 15–30 conversões/mês na Search |

**Sugestão:** 2–4 semanas em **Search** pausada → revisar → ativar com orçamento baixo → só depois PMax reutilizando a mesma conversão primária.

---

## Criar campanha Search (passo a passo)

1. **Nova campanha** → Objetivo **Leads** ou **Vendas** (o que expuser conversão primária `/aluno`).
2. **Search** · Rede: só **Pesquisa** (desmarque parceiros no início se quiser controle).
3. **Local:** Brasil · **Idioma:** Português.
4. **Orçamento:** diário **R$ 30** (teste) — aumente só se CPA estiver aceitável.
5. **Lances:** Maximizar conversões **com** teto de CPA depois da 1ª semana (ou CPC manual no dia 1).
6. **URL final:** link da seção acima (com UTMs).
7. **Grupo de anúncios:** tema “assinatura treino / performance”.
8. **Palavras-chave (ampla modificada ou frase, início conservador):**
   - `+app +treino +musculação`
   - `"planilha de treino"`
   - `"acompanhamento de treino"`
   - `[atlly]` (marca, se houver volume)
9. **Anúncios responsivos:** 3 títulos + 2 descrições mencionando sistema, corrida, 7 dias garantia — CTA “Ativar agora”.
10. **Salvar pausada** → revisar ortografia e URL → **Ativar**.

Negativas úteis no 1º mês: `grátis`, `pdf`, `emprego`, `curso gratuito`, `download`.

---

## Criar Performance Max (quando escalar)

1. Objetivo com mesma **conversão primária** (`/aluno`).
2. **URL final** = mesma `/ativar` + UTMs (`utm_campaign=atlly_pro_pmax_br` no pack gerado).
3. **Orçamento** ≥ **R$ 50/d**; comece **pausada**.
4. Recursos: logo ATLLY, 3–5 imagens, 1 vídeo curto se tiver.
5. Títulos/descrições alinhados ao site (Human Performance System).
6. **Sinais de público:** interesses fitness, corrida, musculação (refinar com dados).

---

## Primeira semana — o que olhar todo dia (5 min)

| Métrica | Meta inicial | Se estiver ruim |
|---------|--------------|-----------------|
| **Impressões** | > 0 após 24 h | Orçamento, lances, palavras muito restritas |
| **Cliques** | CTR Search > 2% (marca > 5%) | Testar títulos/descrições |
| **Custo** | Dentro do orçamento diário | Reduzir lance ou pausar grupo fraco |
| **Conversões** | 1+ em 7 dias (com tráfego) | Testar checkout; confirmar visita a `/aluno` logado |
| **Termos de pesquisa** | Sem lixo óbvio | Adicionar negativas |

**Relatório útil:** Campanhas + colunas Conversões, Custo/conv., Taxa de conv.

**Teste manual de conversão:** concluir assinatura (ou sandbox) → login → URL **`/aluno`** → em 24–48 h ver conversão em Metas.

---

## UTMs e atribuição (site)

First-touch **90 dias** no navegador; API grava UTM no cadastro/checkout quando enviado.

Padronize campanhas:

| utm_source | utm_medium | utm_campaign (exemplo) |
|------------|------------|-------------------------|
| google | paid_search | atlly_pro_br |
| google | paid | atlly_pro_pmax_br |

---

## Checklist “pode escalar?”

- [ ] ≥ **10 conversões** na primária `/aluno` (ou CPA estável 2 semanas)
- [ ] CPA ≤ **30–40%** do ticket Pro (~R$ 97) no teste (ajuste ao seu CAC alvo)
- [ ] Termos de pesquisa limpos
- [ ] Landing `/ativar` carregando rápido no mobile
- [ ] `npm run marketing:verify` verde após cada deploy importante

---

## Referências no repo

- Conta e tag: [google-ads-atlly.md](./google-ads-atlly.md)
- Deploy / envs: [deploy.md](./deploy.md)
- URLs geradas: [google-ads/generated/final-urls.txt](./google-ads/generated/final-urls.txt)
