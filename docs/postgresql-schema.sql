-- PostgreSQL schema for App Treino
-- Run this script in a fresh database or as a baseline migration.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('ADMIN', 'USER');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE billing_cycle AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE membership_status AS ENUM ('ACTIVE', 'PENDING', 'OVERDUE', 'CANCELED');
CREATE TYPE payment_status AS ENUM ('PENDING', 'CONFIRMED', 'OVERDUE', 'REFUNDED', 'CANCELED');
CREATE TYPE event_status AS ENUM ('SCHEDULED', 'CANCELED', 'FINISHED');
CREATE TYPE ticket_category AS ENUM ('GENERAL', 'WORKOUT', 'PAYMENT', 'TECHNICAL');
CREATE TYPE ticket_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
CREATE TYPE ticket_priority AS ENUM ('LOW', 'NORMAL', 'HIGH');

CREATE TABLE users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(255) UNIQUE,
    password_hash TEXT,
    provider VARCHAR(50) NOT NULL DEFAULT 'EMAIL',
    google_id VARCHAR(255) UNIQUE,
    role user_role NOT NULL DEFAULT 'USER',
    status user_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE profiles (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL UNIQUE,
    phone VARCHAR(255),
    document VARCHAR(255),
    birth_date TIMESTAMPTZ,
    objective TEXT,
    level VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_profiles_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE plans (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    code VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    price_in_cents INTEGER NOT NULL,
    billing_cycle billing_cycle NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE memberships (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    status membership_status NOT NULL DEFAULT 'PENDING',
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_memberships_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_memberships_plan
        FOREIGN KEY (plan_id) REFERENCES plans (id) ON DELETE RESTRICT
);

CREATE TABLE payments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    membership_id TEXT NOT NULL,
    amount_in_cents INTEGER NOT NULL,
    status payment_status NOT NULL DEFAULT 'PENDING',
    due_date TIMESTAMPTZ NOT NULL,
    paid_at TIMESTAMPTZ,
    asaas_payment_id VARCHAR(255) UNIQUE,
    payment_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payments_membership
        FOREIGN KEY (membership_id) REFERENCES memberships (id) ON DELETE CASCADE
);

CREATE TABLE workouts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    title VARCHAR(255) NOT NULL,
    objective TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE workout_days (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    workout_id TEXT NOT NULL,
    title VARCHAR(255) NOT NULL,
    sort_order INTEGER NOT NULL,
    CONSTRAINT fk_workout_days_workout
        FOREIGN KEY (workout_id) REFERENCES workouts (id) ON DELETE CASCADE
);

CREATE TABLE exercises (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    workout_day_id TEXT NOT NULL,
    name VARCHAR(255) NOT NULL,
    sets INTEGER NOT NULL,
    reps VARCHAR(255) NOT NULL,
    rest_seconds INTEGER,
    notes TEXT,
    sort_order INTEGER NOT NULL,
    CONSTRAINT fk_exercises_workout_day
        FOREIGN KEY (workout_day_id) REFERENCES workout_days (id) ON DELETE CASCADE
);

CREATE TABLE attendance_records (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL,
    date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_attendance_records_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uq_attendance_records_user_date UNIQUE (user_id, date)
);

CREATE TABLE physical_assessments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL,
    assessed_at TIMESTAMPTZ NOT NULL,
    weight_kg DOUBLE PRECISION,
    height_cm DOUBLE PRECISION,
    body_fat_pct DOUBLE PRECISION,
    waist_cm DOUBLE PRECISION,
    chest_cm DOUBLE PRECISION,
    hip_cm DOUBLE PRECISION,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_physical_assessments_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE events (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    location VARCHAR(255),
    capacity INTEGER,
    status event_status NOT NULL DEFAULT 'SCHEDULED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE event_registrations (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_event_registrations_event
        FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
    CONSTRAINT fk_event_registrations_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uq_event_registrations_event_user UNIQUE (event_id, user_id)
);

CREATE TABLE support_tickets (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL,
    assigned_to_id TEXT,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    category ticket_category NOT NULL DEFAULT 'GENERAL',
    status ticket_status NOT NULL DEFAULT 'OPEN',
    priority ticket_priority NOT NULL DEFAULT 'NORMAL',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_support_tickets_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_support_tickets_assigned_to
        FOREIGN KEY (assigned_to_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE ai_workout_plans (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL,
    objective TEXT NOT NULL,
    level VARCHAR(255) NOT NULL,
    days_per_week INTEGER NOT NULL,
    focus TEXT,
    plan JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_workout_plans_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_memberships_user_id ON memberships (user_id);
CREATE INDEX idx_memberships_plan_id ON memberships (plan_id);
CREATE INDEX idx_payments_membership_id ON payments (membership_id);
CREATE INDEX idx_workout_days_workout_id ON workout_days (workout_id);
CREATE INDEX idx_exercises_workout_day_id ON exercises (workout_day_id);
CREATE INDEX idx_attendance_records_user_id ON attendance_records (user_id);
CREATE INDEX idx_physical_assessments_user_id ON physical_assessments (user_id);
CREATE INDEX idx_event_registrations_event_id ON event_registrations (event_id);
CREATE INDEX idx_event_registrations_user_id ON event_registrations (user_id);
CREATE INDEX idx_support_tickets_user_id ON support_tickets (user_id);
CREATE INDEX idx_support_tickets_assigned_to_id ON support_tickets (assigned_to_id);
CREATE INDEX idx_ai_workout_plans_user_id ON ai_workout_plans (user_id);
