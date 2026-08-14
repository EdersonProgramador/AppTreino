-- CreateTable
CREATE TABLE "student_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "target_section" TEXT,
    "source_type" TEXT,
    "source_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_notifications_user_id_created_at_idx" ON "student_notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "student_notifications_user_id_read_at_idx" ON "student_notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "student_notifications_user_id_source_type_source_id_idx" ON "student_notifications"("user_id", "source_type", "source_id");

-- AddForeignKey
ALTER TABLE "student_notifications" ADD CONSTRAINT "student_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: produtos ativos recentes (30 dias)
INSERT INTO "student_notifications" ("id", "user_id", "type", "title", "message", "target_section", "source_type", "source_id", "read_at", "created_at")
SELECT
  md5(random()::text || clock_timestamp()::text || u.id || p.id),
  u.id,
  'PRODUCT',
  'Novo produto na vitrine',
  p.name,
  'products',
  'product',
  p.id,
  NULL,
  COALESCE(p.created_at, CURRENT_TIMESTAMP)
FROM "products" p
CROSS JOIN "users" u
WHERE p.is_active = true
  AND p.deleted_at IS NULL
  AND p.created_at >= (CURRENT_TIMESTAMP - INTERVAL '30 days')
  AND u.role = 'USER'
  AND u.deleted_at IS NULL
  AND u.status = 'ACTIVE';

-- Backfill: avisos publicados
INSERT INTO "student_notifications" ("id", "user_id", "type", "title", "message", "target_section", "source_type", "source_id", "read_at", "created_at")
SELECT
  md5(random()::text || clock_timestamp()::text || u.id || a.id),
  u.id,
  'ANNOUNCEMENT',
  a.title,
  a.body,
  NULL,
  'announcement',
  a.id,
  NULL,
  COALESCE(a.published_at, a.created_at, CURRENT_TIMESTAMP)
FROM "announcements" a
CROSS JOIN "users" u
WHERE a.status = 'PUBLISHED'
  AND a.deleted_at IS NULL
  AND u.role = 'USER'
  AND u.deleted_at IS NULL
  AND u.status = 'ACTIVE';

-- Backfill: eventos agendados
INSERT INTO "student_notifications" ("id", "user_id", "type", "title", "message", "target_section", "source_type", "source_id", "read_at", "created_at")
SELECT
  md5(random()::text || clock_timestamp()::text || u.id || e.id),
  u.id,
  'EVENT',
  'Evento publicado',
  e.title,
  'events',
  'event',
  e.id,
  NULL,
  COALESCE(e.created_at, CURRENT_TIMESTAMP)
FROM "events" e
CROSS JOIN "users" u
WHERE e.status = 'SCHEDULED'
  AND e.deleted_at IS NULL
  AND u.role = 'USER'
  AND u.deleted_at IS NULL
  AND u.status = 'ACTIVE';

-- Backfill: programas publicados ativos
INSERT INTO "student_notifications" ("id", "user_id", "type", "title", "message", "target_section", "source_type", "source_id", "read_at", "created_at")
SELECT
  md5(random()::text || clock_timestamp()::text || u.id || p.id),
  u.id,
  'WORKOUT_PROGRAM',
  'Novo programa de treino',
  p.title,
  'training',
  'program',
  p.id,
  NULL,
  COALESCE(p.published_at, p.created_at, CURRENT_TIMESTAMP)
FROM "programs" p
CROSS JOIN "users" u
WHERE p.status = 'PUBLISHED'
  AND p.is_active = true
  AND p.deleted_at IS NULL
  AND u.role = 'USER'
  AND u.deleted_at IS NULL
  AND u.status = 'ACTIVE';
