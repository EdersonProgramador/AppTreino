# Campanha Search — meta 100 assinaturas (ATLLY)

**Conta:** 244-230-6941 · **Tag:** AW-18513371658 · **Conversão primária:** URL contém `/aluno`

> Este arquivo é o “pacote pronto” para colar no Google Ads. Publicação só na sua conta ([ads.google.com](https://ads.google.com)).

---

## Meta e orçamento

| Premissa | Valor |
|----------|--------|
| Ticket referência (Pro) | ~**R$ 97/mês** |
| Meta | **100 assinaturas** (conversões primárias) |
| CPA alvo (teste) | **R$ 50–80** por assinatura |
| Investimento estimado | **R$ 5.000 – R$ 8.000** no total |
| Prazo sugerido | **60–90 dias** (aprendizado + escala) |
| Orçamento diário inicial | **R$ 60/dia** → ~R$ 1.800/mês |

Ajuste: se após **7 dias** com ≥300 cliques o CPA estiver > R$ 100, pause grupos fracos e refine anúncios/negativas antes de subir orçamento.

**URL final (use em todos os anúncios):**

```text
https://www.atlly.com.br/ativar?utm_source=google&utm_medium=paid_search&utm_campaign=atlly_100_assinaturas_search
```

(Sem `plan=` na URL — o aluno escolhe o plano no funil. Adicione `&coupon=GOOGLE15` só se o cupom existir no admin.)

---

## Passo a passo no Google Ads (≈20 min)

1. **Metas → Conversões** — primária = página contém **`/aluno`**.
2. **Campanhas → Nova campanha**
   - Objetivo: **Leads** ou **Vendas** (com conversão primária acima).
   - Tipo: **Pesquisa**.
   - Rede: **só Pesquisa** (desative Display/parceiros no início).
3. **Configuração da campanha**
   - Nome: `ATLLY | Search | 100 assinaturas | BR`
   - Local: **Brasil**
   - Idioma: **Português**
   - Orçamento: **R$ 60,00/dia**
   - Lances: **Maximizar conversões** (sem tCPA na semana 1; depois tCPA ≈ R$ 70)
4. Crie **4 grupos de anúncios** (abaixo), cada um com palavras + 1 RSA.
5. **Salvar campanha pausada** → revisar → **Ativar**.

---

## Grupo 1 — Marca

**Palavras-chave (frase ou exata):**

```text
[atlly]
"atlly"
"atlly treino"
"atlly app"
```

**RSA — títulos (até 30 caracteres cada; escolha 8–10):**

```text
ATLLY — Performance System
Assine o ATLLY Hoje
Treino + Corrida + Dados
App ATLLY — Ative Agora
Sistema de Performance
Human Performance System
7 Dias de Garantia
Acesso Imediato ao ATLLY
```

**Descrições (até 90 caracteres; use 3–4):**

```text
Treino, corrida e evolução em um só lugar. Ative sua conta em minutos. Garantia 7 dias.
Registre cargas, atividades GPS e progresso. Assinatura mensal com acesso imediato.
Comunidade, desafios e métricas. Comece no ATLLY — Human Performance System.
```

---

## Grupo 2 — App / sistema de treino

**Palavras-chave:**

```text
"app de treino"
"app treino musculação"
"sistema de treino"
"aplicativo de treino"
"app para academia"
+app +treino +academia
```

**Títulos extras:**

```text
App de Treino Completo
Treino e Corrida no Mesmo App
Histórico de Cargas e GPS
Organize Seus Treinos
```

---

## Grupo 3 — Planilha / cargas

**Palavras-chave:**

```text
"planilha de treino"
"controle de cargas"
"registro de treino"
"histórico de treino"
+registrar +cargas +treino
```

**Títulos extras:**

```text
Substitua a Planilha de Treino
Registre Séries e Cargas
Evolução Sem Planilha
```

---

## Grupo 4 — Corrida + musculação

**Palavras-chave:**

```text
"app corrida e musculação"
"treino e corrida app"
"acompanhar corrida e treino"
+corrida +treino +app
```

**Títulos extras:**

```text
Corrida, Bike e Musculação
Um Perfil Para Tudo
Treino + Corrida Integrados
```

---

## Negativas (campanha ou conta — adicione desde o dia 1)

```text
grátis
gratis
pdf
download
emprego
vaga
curso gratuito
estágio
receita
whey
suplemento
```

Revise **Termos de pesquisa** a cada 48 h na 1ª semana.

---

## Extensões (recomendado)

| Extensão | Texto |
|----------|--------|
| **Sitelink 1** | Planos → `/ativar` |
| **Sitelink 2** | Garantia 7 dias → `/ativar` |
| **Frases destacadas** | Acesso imediato · Treino + corrida · Garantia 7 dias |
| **Chamada** | Só se tiver telefone comercial ATLLY |

---

## Acompanhamento (meta 100)

| Semana | Foco |
|--------|------|
| 1 | Impressões, CTR, termos de pesquisa, negativas |
| 2–4 | CPA por grupo; pausar keywords sem conversão |
| 5+ | Subir orçamento 15–20% se CPA ≤ R$ 70 e ≥15 conversões/mês |

Colunas no relatório: **Conversões (primária)**, **Custo/conv.**, **Taxa de conv.**, **Custo**.

Projeção linear (ideal): **~12–17 assinaturas/mês** com R$ 60/d e CPA R$ 70 → 100 assinaturas em **~6–8 meses**. Para acelerar, orçamento **R$ 120–150/d** após CPA estável (investimento total sobe proporcionalmente).

---

## O que não dá para fazer daqui

Publicar na conta **244-230-6941** exige login no **Google Ads** ou API com credenciais de desenvolvedor. Use este doc + [playbook manual](../google-ads-manual-playbook.md).

Validação pós-deploy: `npm run marketing:verify`
