-- AddAdminListIndexes
-- Índices para acelerar as listagens do painel admin (filtros por usuário/relacionamentos).

CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

CREATE INDEX "payments_membership_id_idx" ON "payments"("membership_id");

CREATE INDEX "physical_assessments_user_id_idx" ON "physical_assessments"("user_id");

CREATE INDEX "workout_sessions_user_id_idx" ON "workout_sessions"("user_id");

CREATE INDEX "support_tickets_user_id_idx" ON "support_tickets"("user_id");
CREATE INDEX "support_tickets_assigned_to_id_idx" ON "support_tickets"("assigned_to_id");

CREATE INDEX "event_registrations_event_id_idx" ON "event_registrations"("event_id");
CREATE INDEX "event_registrations_user_id_idx" ON "event_registrations"("user_id");
