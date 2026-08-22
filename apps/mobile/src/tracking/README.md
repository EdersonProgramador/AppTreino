# Tracking Core (`apps/mobile/src/tracking`)

Motor local-first de corrida/caminhada/ciclismo.

## Roadmap A→E (status)

| Fatia | Conteúdo | Status |
|-------|----------|--------|
| **A** | Maps plugin + calibração + pedômetro | OK |
| **B** | Elev↑↓, steps/cadência, potência bike, HR via `trackingMeta` | OK |
| **C** | Splits + best/worst + best efforts + share card | OK |
| **F** | Score/quarentena + admin replay SVG | OK |
| **D** | Segmentos nomeados, PR no finish, nearby/create/leaderboard UI | OK |
| **E** | Share nativo, Kudos ACTIVITY, challenges H3 (filtro + progresso) | OK |

## Live GPS → Mapa

```
TRACKING_LOCATION_TASK
  → liveMapStore / SessionManager / PointPipeline
  → TrackingMap (+ heatTracks quando idle)
Finish → geofence → anti-cheat → RDP → H3 → API
Outbox FINISH → points + retry /finish (idempotente)
```

## Endpoints

```
POST /student/activities/:id/finish → activity, segmentEfforts, moderation
GET  /student/activities/named-segments/nearby
POST /student/activities/named-segments
GET  /student/activities/named-segments/:id/leaderboard
GET  /student/social/challenges?lat=&lng=
GET  /admin/outdoor-activities/:id/replay
```

## Config

- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` no `.env` + rebuild nativo
- Migration `20260822120000_outdoor_metrics_segments`
- HR real (HealthKit/Fit) ainda opcional — API aceita `avgHeartRateBpm`/`maxHeartRateBpm` no trackingMeta
