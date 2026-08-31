-- Camada organizacional: organizations, units, RBAC org, vínculos opcionais.
-- Não altera fluxo de assinatura individual (memberships/plans).

CREATE TYPE "OrganizationType" AS ENUM ('ACADEMY', 'BOX', 'STUDIO', 'RUNNING_TEAM', 'OTHER');
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
CREATE TYPE "UnitStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "OrganizationMemberRole" AS ENUM ('PLATFORM_OWNER', 'ORGANIZATION_ADMIN', 'UNIT_MANAGER', 'COACH', 'NUTRITIONIST', 'ATHLETE');
CREATE TYPE "OrganizationMemberStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
CREATE TYPE "AthleteOrganizationStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED');
CREATE TYPE "ProfessionalType" AS ENUM ('COACH', 'NUTRITIONIST');
CREATE TYPE "ProfessionalAssignmentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ENDED');
CREATE TYPE "TrainingClassStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "TrainingClassMemberStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "ProgramSourceType" AS ENUM ('PLATFORM', 'ORGANIZATION', 'COACH');
CREATE TYPE "ProgramVisibility" AS ENUM ('PUBLIC', 'ORGANIZATION', 'ASSIGNED');
CREATE TYPE "UserProgramAssignmentSource" AS ENUM ('PLATFORM_AUTO', 'ADMIN', 'COACH', 'ORGANIZATION', 'CLASS');
CREATE TYPE "NutritionPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "NutritionAssignmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "AccessScope" AS ENUM ('GLOBAL', 'ORGANIZATION', 'UNIT', 'ASSIGNED_ATHLETES', 'SELF');

ALTER TABLE "locations" ADD COLUMN "organization_id" TEXT;

ALTER TABLE "programs" ADD COLUMN "source_type" "ProgramSourceType" NOT NULL DEFAULT 'PLATFORM';
ALTER TABLE "programs" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "programs" ADD COLUMN "unit_id" TEXT;
ALTER TABLE "programs" ADD COLUMN "coach_user_id" TEXT;
ALTER TABLE "programs" ADD COLUMN "visibility" "ProgramVisibility" NOT NULL DEFAULT 'PUBLIC';

ALTER TABLE "user_programs" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "user_programs" ADD COLUMN "unit_id" TEXT;
ALTER TABLE "user_programs" ADD COLUMN "assigned_by_user_id" TEXT;
ALTER TABLE "user_programs" ADD COLUMN "training_class_id" TEXT;
ALTER TABLE "user_programs" ADD COLUMN "assignment_source" "UserProgramAssignmentSource" NOT NULL DEFAULT 'PLATFORM_AUTO';

CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL DEFAULT 'OTHER',
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "neighborhood" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" "UnitStatus" NOT NULL DEFAULT 'ACTIVE',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "unit_id" TEXT,
    "user_id" TEXT NOT NULL,
    "role" "OrganizationMemberRole" NOT NULL,
    "status" "OrganizationMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "athlete_organization_links" (
    "id" TEXT NOT NULL,
    "athlete_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "status" "AthleteOrganizationStatus" NOT NULL DEFAULT 'PENDING',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "athlete_organization_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "professional_assignments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "athlete_id" TEXT NOT NULL,
    "professional_type" "ProfessionalType" NOT NULL,
    "modality_id" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProfessionalAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "professional_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "unit_modalities" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "modality_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "unit_modalities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "training_classes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "modality_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "schedule_data" JSONB,
    "capacity" INTEGER,
    "status" "TrainingClassStatus" NOT NULL DEFAULT 'ACTIVE',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "training_classes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "training_class_members" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "athlete_id" TEXT NOT NULL,
    "status" "TrainingClassMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "training_class_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_plans" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "nutritionist_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "NutritionPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "nutrition_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_assignments" (
    "id" TEXT NOT NULL,
    "nutrition_plan_id" TEXT NOT NULL,
    "athlete_id" TEXT NOT NULL,
    "assigned_by_user_id" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "status" "NutritionAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "nutrition_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rbac_roles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "AccessScope" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rbac_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rbac_permissions" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rbac_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rbac_role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    CONSTRAINT "rbac_role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

CREATE TABLE "platform_operators" (
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_operators_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "plan_features" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "feature_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "organization_id" TEXT,
    "unit_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE INDEX "organizations_status_deleted_at_idx" ON "organizations"("status", "deleted_at");
CREATE INDEX "units_organization_id_status_deleted_at_idx" ON "units"("organization_id", "status", "deleted_at");
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_role_key" ON "organization_members"("organization_id", "user_id", "role");
CREATE INDEX "organization_members_user_id_status_idx" ON "organization_members"("user_id", "status");
CREATE INDEX "organization_members_organization_id_unit_id_role_idx" ON "organization_members"("organization_id", "unit_id", "role");
CREATE UNIQUE INDEX "athlete_organization_links_athlete_id_organization_id_unit_id_key" ON "athlete_organization_links"("athlete_id", "organization_id", "unit_id");
CREATE INDEX "athlete_organization_links_organization_id_unit_id_status_idx" ON "athlete_organization_links"("organization_id", "unit_id", "status");
CREATE INDEX "professional_assignments_professional_id_status_idx" ON "professional_assignments"("professional_id", "status");
CREATE INDEX "professional_assignments_athlete_id_status_idx" ON "professional_assignments"("athlete_id", "status");
CREATE INDEX "professional_assignments_organization_id_unit_id_idx" ON "professional_assignments"("organization_id", "unit_id");
CREATE UNIQUE INDEX "unit_modalities_unit_id_modality_id_key" ON "unit_modalities"("unit_id", "modality_id");
CREATE INDEX "training_classes_organization_id_unit_id_status_idx" ON "training_classes"("organization_id", "unit_id", "status");
CREATE INDEX "training_classes_coach_id_idx" ON "training_classes"("coach_id");
CREATE UNIQUE INDEX "training_class_members_class_id_athlete_id_key" ON "training_class_members"("class_id", "athlete_id");
CREATE INDEX "training_class_members_athlete_id_status_idx" ON "training_class_members"("athlete_id", "status");
CREATE INDEX "nutrition_plans_organization_id_unit_id_status_idx" ON "nutrition_plans"("organization_id", "unit_id", "status");
CREATE INDEX "nutrition_assignments_athlete_id_status_idx" ON "nutrition_assignments"("athlete_id", "status");
CREATE INDEX "nutrition_assignments_nutrition_plan_id_idx" ON "nutrition_assignments"("nutrition_plan_id");
CREATE UNIQUE INDEX "rbac_roles_slug_key" ON "rbac_roles"("slug");
CREATE UNIQUE INDEX "rbac_permissions_slug_key" ON "rbac_permissions"("slug");
CREATE UNIQUE INDEX "plan_features_plan_id_feature_key_key" ON "plan_features"("plan_id", "feature_key");
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");
CREATE INDEX "locations_organization_id_idx" ON "locations"("organization_id");
CREATE INDEX "programs_source_type_organization_id_unit_id_idx" ON "programs"("source_type", "organization_id", "unit_id");
CREATE INDEX "user_programs_organization_id_unit_id_idx" ON "user_programs"("organization_id", "unit_id");

ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "programs" ADD CONSTRAINT "programs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "programs" ADD CONSTRAINT "programs_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_programs" ADD CONSTRAINT "user_programs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_programs" ADD CONSTRAINT "user_programs_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_programs" ADD CONSTRAINT "user_programs_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_programs" ADD CONSTRAINT "user_programs_training_class_id_fkey" FOREIGN KEY ("training_class_id") REFERENCES "training_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "units" ADD CONSTRAINT "units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "athlete_organization_links" ADD CONSTRAINT "athlete_organization_links_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "athlete_organization_links" ADD CONSTRAINT "athlete_organization_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "athlete_organization_links" ADD CONSTRAINT "athlete_organization_links_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "professional_assignments" ADD CONSTRAINT "professional_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "professional_assignments" ADD CONSTRAINT "professional_assignments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "professional_assignments" ADD CONSTRAINT "professional_assignments_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "professional_assignments" ADD CONSTRAINT "professional_assignments_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "professional_assignments" ADD CONSTRAINT "professional_assignments_modality_id_fkey" FOREIGN KEY ("modality_id") REFERENCES "modalities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "unit_modalities" ADD CONSTRAINT "unit_modalities_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "unit_modalities" ADD CONSTRAINT "unit_modalities_modality_id_fkey" FOREIGN KEY ("modality_id") REFERENCES "modalities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_classes" ADD CONSTRAINT "training_classes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_classes" ADD CONSTRAINT "training_classes_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_classes" ADD CONSTRAINT "training_classes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_classes" ADD CONSTRAINT "training_classes_modality_id_fkey" FOREIGN KEY ("modality_id") REFERENCES "modalities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "training_class_members" ADD CONSTRAINT "training_class_members_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "training_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nutrition_plans" ADD CONSTRAINT "nutrition_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nutrition_plans" ADD CONSTRAINT "nutrition_plans_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nutrition_plans" ADD CONSTRAINT "nutrition_plans_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nutrition_assignments" ADD CONSTRAINT "nutrition_assignments_nutrition_plan_id_fkey" FOREIGN KEY ("nutrition_plan_id") REFERENCES "nutrition_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nutrition_assignments" ADD CONSTRAINT "nutrition_assignments_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nutrition_assignments" ADD CONSTRAINT "nutrition_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rbac_role_permissions" ADD CONSTRAINT "rbac_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "rbac_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rbac_role_permissions" ADD CONSTRAINT "rbac_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "rbac_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_operators" ADD CONSTRAINT "platform_operators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
