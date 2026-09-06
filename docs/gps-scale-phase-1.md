# GPS + Mapbox — Fase 1 (1.000 corredores simultâneos)

Roadmap técnico para escalar o módulo outdoor (RUN / WALK / RIDE) de ~500 para ~1.000 usuários ativos com GPS ao mesmo tempo.

**Contexto atual:** sync REST em `POST /student/activities/:id/points`, polyline JSON na linha `OutdoorActivity`, Map Matching síncrono no finish, Render Starter + Neon.

**Referências:** `apps/api/src/modules/social.routes.ts`, `activity-map-match.ts`, `apps/mobile/src/tracking/`, `apps/web/src/components/student/StudentActivitySection.tsx`.

---

## Tickets

### GPS-1 — Métrica LIVE no admin summary

**Prioridade:** Alta · **Esforço:** S · **Depende de:** —

**Objetivo:** Expor `liveOutdoorActivities` (status `LIVE` ou `PAUSED`) em `GET /admin/summary` e KPI no dashboard.

**Arquivos:**
- `apps/api/src/modules/admin.routes.ts`
- `apps/web/src/components/admin/AdminDashboardOverview.tsx`

**Critérios de aceite:**
- [ ] Contagem bate com `SELECT count(*) FROM outdoor_activities WHERE status IN ('LIVE','PAUSED')`
- [ ] Dashboard mostra “Correndo agora” com refresh do summary
- [ ] Alerta visual se count > 800 (80% da Fase 1)

---

### GPS-2 — Fila assíncrona para Map Matching no finish

**Prioridade:** Alta · **Esforço:** M · **Depende de:** —

**Objetivo:** `POST /student/activities/:id/finish` persiste atividade como `COMPLETED` com GPS bruto e enfileira job; worker chama Mapbox e atualiza polyline/summary depois.

**Arquivos:**
- `apps/api/src/modules/activity-map-match.ts` (sem mudança de contrato)
- `apps/api/src/modules/social.routes.ts` (finish handler)
- **Novo:** `apps/api/src/modules/activity-finish-queue.ts`
- **Novo:** `apps/api/src/workers/activity-finish.worker.ts` (ou job no boot se Redis indisponível = inline fallback)

**Stack sugerida:** BullMQ + Redis (Upstash) ou fila Postgres (`activity_finish_jobs`).

**Schema (se Postgres queue):**
```sql
CREATE TABLE activity_finish_jobs (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES outdoor_activities(id),
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
```

**Critérios de aceite:**
- [ ] Finish responde em < 500 ms p95 sem esperar Mapbox
- [ ] Mobile/web recebem `activity.status === COMPLETED` imediatamente
- [ ] Polyline matched aparece em até 30 s (poll ou push futuro)
- [ ] Retry com backoff em falha Mapbox; fallback GPS cru após N tentativas
- [ ] Teste: finish sem `MAPBOX_ACCESS_TOKEN` não quebra fila

---

### GPS-3 — Métricas incrementais no `/points` (sem reler polyline inteira)

**Prioridade:** Alta · **Esforço:** M · **Depende de:** —

**Objetivo:** Reduzir CPU e I/O recalculando distância/pace de forma incremental em vez de `buildStravaSummary` sobre array completo a cada batch.

**Arquivos:**
- `apps/api/src/modules/activity-geo.ts` — `appendPointsToActivityStats(prev, newPoints)`
- `apps/api/src/modules/social.routes.ts` — handler `/points`

**Abordagem mínima (Fase 1):**
- Guardar em `summary.trackingMeta` ou colunas existentes: `lastPoint`, `movingSecondsAcc`, `distanceAcc`
- Só reprocessar segmento novo + janela de auto-pause

**Critérios de aceite:**
- [ ] Resultado numérico equivalente ao pipeline atual em testes (`activity-geo.test.ts`)
- [ ] p95 `/points` cai ≥ 40% com polyline de 5.000+ pontos
- [ ] Cap de 20.000 pontos mantido

---

### GPS-4 — Tabela append-only `activity_point_chunks` (prep Fase 2)

**Prioridade:** Média · **Esforço:** L · **Depende de:** GPS-3

**Objetivo:** Parar de reescrever JSON `polyline` a cada sync; gravar chunks de ~60 s ou 200 pontos.

**Migration:**
```sql
CREATE TABLE activity_point_chunks (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES outdoor_activities(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  points JSONB NOT NULL,
  point_count INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(activity_id, seq)
);
CREATE INDEX activity_point_chunks_activity_id_idx ON activity_point_chunks(activity_id);
```

**Arquivos:**
- `apps/api/prisma/schema.prisma`
- `apps/api/src/modules/social.routes.ts`
- `apps/mobile/src/tracking/sync/OutboxSync.ts` (compat: API aceita chunks + legacy)

**Critérios de aceite:**
- [ ] `/points` faz INSERT em chunk, não UPDATE de polyline gigante
- [ ] Finish monta polyline a partir dos chunks
- [ ] Rollback: flag `USE_POINT_CHUNKS=true` no env

---

### GPS-5 — Rate limit por userId em rotas outdoor

**Prioridade:** Média · **Esforço:** S · **Depende de:** —

**Objetivo:** Limitar abuso sem depender só de IP (NAT, proxies).

**Arquivos:**
- `apps/api/src/server.ts` ou plugin `outdoor-rate-limit.ts`
- Rotas: `/student/activities/:id/points` (ex.: 120/min/user), `/match-roads` (manter 20/min)

**Critérios de aceite:**
- [ ] Usuário legítimo (10 req/min) nunca bloqueado
- [ ] 429 com mensagem clara
- [ ] `/health` e media fora do bucket

---

### GPS-6 — Load test k6 (baseline Fase 1)

**Prioridade:** Média · **Esforço:** S · **Depende de:** GPS-2, GPS-3

**Objetivo:** Script reproduzível simulando 1.000 sessões LIVE enviando `/points` a cada 5 s.

**Novo:** `apps/api/scripts/load-test-gps-points.k6.js`

**Critérios de aceite:**
- [ ] Documentar comando e env vars
- [ ] Relatório: RPS, p95, taxa de erro, CPU Render
- [ ] Meta Fase 1: p95 < 300 ms, erro < 1% em 1.000 VUs

---

### GPS-7 — Infra: Render Standard + Neon Scale

**Prioridade:** Média · **Esforço:** S (ops) · **Depende de:** —

**Checklist deploy:**
- [ ] Render: Standard ou 2 instâncias + health check
- [ ] Neon: Scale + pooler (PgBouncer)
- [ ] Redis Upstash para GPS-2
- [ ] Variáveis: `REDIS_URL`, `ACTIVITY_FINISH_QUEUE=redis`

**Arquivos:** `render.yaml`, `docs/deploy.md`

---

## Ordem de execução recomendada

```
GPS-1 (métricas) → GPS-3 (incremental) → GPS-2 (fila finish) → GPS-5 → GPS-6 → GPS-4
                     GPS-7 (infra em paralelo)
```

## Estimativa

| Ticket | Dev | Infra/mês após Fase 1 |
|--------|-----|------------------------|
| GPS-1 a GPS-3 | 1–2 semanas | — |
| GPS-2 + GPS-7 | 3–5 dias + ops | +$50–150 |
| GPS-4 | 1–2 semanas | — |
| **Total Fase 1** | **~2 semanas** | **~$160–470/mês** |

## Fora de escopo (Fase 2+)

- WebSocket live tracking social
- Ingest service dedicado auto-scale
- Mapbox Enterprise contract
- 10.000 simultâneos (ver plano Fase 2/3)
