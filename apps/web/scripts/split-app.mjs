import fs from "node:fs";
import path from "node:path";

const src = path.resolve("src");
const appPath = path.join(src, "App.tsx");
const lines = fs.readFileSync(appPath, "utf8").split(/\r?\n/);

function slice(start, end) {
  return lines.slice(start - 1, end).join("\n");
}

function write(rel, content) {
  const file = path.join(src, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.endsWith("\n") ? content : content + "\n", "utf8");
}

function exportInterfaces(code) {
  return code
    .replace(/^interface /gm, "export interface ")
    .replace(/^type /gm, "export type ")
    .replace(/^const (assessment|CMS_|ALL_)/gm, "export const $1");
}

function exportFunctions(code) {
  return code.replace(/^function /gm, "export function ").replace(/^const /gm, "export const ");
}

// --- types ---
write(
  "types/auth.ts",
  exportInterfaces(slice(91, 119)) +
    "\n\nexport {};\n"
);

const sharedBody = exportInterfaces(
  [
    slice(296, 318),
    slice(320, 326),
    slice(683, 692),
    slice(721, 730),
    slice(732, 789),
    slice(811, 848),
    slice(858, 880),
    slice(882, 955),
    slice(1003, 1016)
  ].join("\n\n")
);
write("types/shared.ts", sharedBody);

const adminBody = exportInterfaces(
  [
    slice(345, 502),
    slice(533, 591),
    slice(791, 809),
    slice(970, 1001),
    slice(2123, 2170)
  ].join("\n\n")
);
write(
  "types/admin.ts",
  `import type {
  AdminUser,
  AiWorkoutPlanRow,
  EventRow,
  MembershipRow,
  PaymentRow,
  PhysicalAssessmentForm,
  PhysicalAssessmentRow,
  SupportTicketRow
} from "./shared";
import type {
  WorkoutIntensityType,
  WorkoutPrescriptionType,
  WorkoutStructureType
} from "../components/student/WorkoutPlayer";

${adminBody}`
);

const studentBody = exportInterfaces(
  [
    slice(328, 343),
    slice(396, 408),
    slice(694, 719),
    slice(850, 856),
    slice(957, 968),
    slice(1243, 1342)
  ].join("\n\n")
);
write(
  "types/student.ts",
  `import type { PlanRow } from "./shared";
import type { WorkoutPlayerExercise, WorkoutStructureType } from "../components/student/WorkoutPlayer";

${studentBody}`
);

write(
  "types/index.ts",
  `export * from "./auth";
export * from "./shared";
export * from "./admin";
export * from "./student";
`
);

// --- lib ---
write("lib/urls.ts", exportFunctions(slice(121, 133)));
write("lib/locations.ts", exportFunctions(slice(135, 137)));
write(
  "lib/dates.ts",
  exportFunctions(slice(139, 155) + "\n\n" + slice(215, 242))
);
write("lib/body-composition.ts", exportFunctions(slice(157, 213)));
write(
  "lib/home-content.ts",
  `import {
  CircleDollarSign,
  Dumbbell,
  LineChart,
  MessageCircle
} from "lucide-react";

${exportFunctions(slice(244, 294))}`
);
write(
  "lib/cms.ts",
  `import type { AdminTrashKind, CmsProgramRow } from "../types/admin";
import type { TodayWorkoutResponse } from "../types/student";

${exportFunctions(slice(504, 531) + "\n\n" + slice(593, 681))}`
);

// --- component import headers ---
const allLucideIcons = [
  "Activity", "AlertCircle", "ArrowRight", "ArrowUpRight", "Bell", "Bot", "Building2",
  "CalendarDays", "CalendarPlus", "Check", "ChevronLeft", "ChevronRight", "CircleDollarSign",
  "ClipboardList", "Clock", "CreditCard", "Dumbbell", "Eye", "Flame", "Headphones", "Home",
  "Image", "ImageOff", "LineChart", "Loader2", "LockKeyhole", "LogOut", "LogIn", "FileText",
  "GripVertical", "MapPin", "Megaphone", "Menu", "MessageCircle", "Package", "PanelLeftClose",
  "PanelLeftOpen", "Pencil", "Phone", "Play", "Plus", "QrCode", "RefreshCw", "RotateCcw",
  "Ruler", "Save", "Search", "Send", "Settings", "Share2", "ShieldCheck", "ShoppingCart",
  "Sparkles", "Star", "Target", "Timer", "Trash2", "TrendingUp", "Trophy", "UploadCloud",
  "UserRound", "UsersRound", "Wallet", "X"
];

function lucideImportFor(content) {
  const used = allLucideIcons.filter((icon) => {
    const re = new RegExp(`\\b${icon}\\b`);
    return re.test(content);
  });
  if (used.length === 0) return "";
  return `import {\n  ${used.join(",\n  ")}\n} from "lucide-react";\n`;
}

function prepend(rel, header) {
  const file = path.join(src, rel);
  const body = fs.readFileSync(file, "utf8");
  const fn = body.match(/^function (\w+)/)?.[1];
  const exported = fn ? body.replace(`function ${fn}`, `export function ${fn}`) : body;
  write(rel, header + exported);
}

const homeBody = fs.readFileSync(path.join(src, "components/home/HomeView.tsx"), "utf8");
prepend(
  "components/home/HomeView.tsx",
  `${lucideImportFor(homeBody)}import { formatPriceInBRL, initialPlans } from "@app-treino/shared";
import { assetUrl } from "../../lib/urls";
import { faqItems, resources } from "../../lib/home-content";

`
);

const loginBody = fs.readFileSync(path.join(src, "components/auth/LoginView.tsx"), "utf8");
prepend(
  "components/auth/LoginView.tsx",
  `${lucideImportFor(loginBody)}import { useEffect, useRef, useState } from "react";
import { initialPlans } from "@app-treino/shared";
import { WorkoutOnboarding, type WorkoutOnboardingSubmitPayload } from "../onboarding/WorkoutOnboarding";
import type { AuthMode, PlanCode } from "../../types/auth";
import { googleClientId } from "../../lib/urls";

`
);

const physBody = fs.readFileSync(path.join(src, "components/shared/PhysicalAssessmentFormView.tsx"), "utf8");
prepend(
  "components/shared/PhysicalAssessmentFormView.tsx",
  `${lucideImportFor(physBody)}import type { FormEvent } from "react";
import type { AssessmentPhotoKey, PhysicalAssessmentForm } from "../../types/shared";
import { assessmentPerimeterKeys, assessmentPhotoFields } from "../../types/admin";

`
);

const dashBody = fs.readFileSync(path.join(src, "components/admin/AdminDashboardOverview.tsx"), "utf8");
prepend(
  "components/admin/AdminDashboardOverview.tsx",
  `${lucideImportFor(dashBody)}import type { LucideIcon } from "lucide-react";
import { formatPriceInBRL } from "@app-treino/shared";
import type {
  AdminResource,
  AdminUser,
  ContactMessageRow,
  EventRow,
  FavoriteRow,
  MembershipRow,
  PaymentRow,
  ProductRow,
  PurchaseRow,
  RatingRow,
  SupportTicketRow
} from "../../types";

`
);

const reportsBody = fs.readFileSync(path.join(src, "components/admin/AdminReports.tsx"), "utf8");
prepend(
  "components/admin/AdminReports.tsx",
  `${lucideImportFor(reportsBody)}import { useMemo } from "react";
import type { AdminUser, PaymentRow, PhysicalAssessmentRow, RatingRow } from "../../types";

`
);

const pagBody = fs.readFileSync(path.join(src, "components/admin/AdminPaginationBar.tsx"), "utf8");
prepend(
  "components/admin/AdminPaginationBar.tsx",
  `${lucideImportFor(pagBody)}
`
);

const adminBodyFile = fs.readFileSync(path.join(src, "components/admin/AdminView.tsx"), "utf8");
prepend(
  "components/admin/AdminView.tsx",
  `${lucideImportFor(adminBodyFile)}import type { LucideIcon } from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { formatPriceInBRL } from "@app-treino/shared";
import { ApiError, apiDelete, apiGet, apiPost, apiPut, apiUpload } from "../../api";
import { BRAZILIAN_STATES, CITIES_BY_STATE } from "../../brazil-data";
import {
  estimateProgramCalendarDays,
  formatProgramDuration,
  getCmsProgramReadiness,
  parseProgramMetadata,
  trashKindLabel,
  trashResourceBase,
  trashSoftDeleteBase
} from "../../lib/cms";
import { calculateBodyFatEstimate } from "../../lib/body-composition";
import { formatAssessmentDateTime, formatDateTimeLocalInputValue } from "../../lib/dates";
import { assetUrl, mediaUrl } from "../../lib/urls";
import { studentLocationLabel } from "../../lib/locations";
import type {
  AdminResource,
  AdminStudentOverview,
  AdminTrashData,
  AdminTrashKind,
  AdminUser,
  AiWorkoutPlanRow,
  AssessmentPhotoKey,
  CmsAnnouncementRow,
  CmsDeleteTarget,
  CmsExerciseRow,
  CmsLocationRow,
  CmsModalityRow,
  CmsProgramRow,
  CmsPublishPreview,
  CmsWorkoutBlockRow,
  CmsWorkflowSummary,
  ContactMessageRow,
  EventRow,
  FavoriteRow,
  MembershipRow,
  PaymentCardRow,
  PaymentRow,
  PhysicalAssessmentForm,
  PhysicalAssessmentRow,
  PlanRow,
  ProductRow,
  PurchaseRow,
  RatingRow,
  SupportTicketRow,
  UploadResponse,
  WorkoutRow
} from "../../types";
import { ALL_ADMIN_RESOURCES, ALL_TRASH_KINDS, CMS_TRASH_KINDS } from "../../types/admin";
import { PhysicalAssessmentFormView } from "../shared/PhysicalAssessmentFormView";
import { StateCityFields } from "./StateCityFields";
import { AdminDashboardOverview } from "./AdminDashboardOverview";
import { AdminPaginationBar } from "./AdminPaginationBar";
import { AdminReports } from "./AdminReports";

`
);

const userBodyFile = fs.readFileSync(path.join(src, "components/student/UserView.tsx"), "utf8");
prepend(
  "components/student/UserView.tsx",
  `${lucideImportFor(userBodyFile)}import { lazy, Suspense, type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { formatPriceInBRL } from "@app-treino/shared";
import { ApiError, apiDelete, apiGet, apiPost, apiPut, apiUpload } from "../../api";
import { BRAZILIAN_STATES, CITIES_BY_STATE } from "../../brazil-data";
import { calculateBodyFatEstimate } from "../../lib/body-composition";
import { buildMonthCalendar, formatAssessmentDateTime, formatDateTimeLocalInputValue, monthLabel } from "../../lib/dates";
import { formatProgramDuration } from "../../lib/cms";
import { assetUrl, mediaUrl } from "../../lib/urls";
import { studentLocationLabel } from "../../lib/locations";
import type {
  AssessmentPhotoKey,
  CheckoutSessionResponse,
  NotificationRow,
  PaymentCardRow,
  PaymentRow,
  PhysicalAssessmentForm,
  PhysicalAssessmentRow,
  PlanRow,
  ProductRow,
  PurchaseRow,
  StudentFavoriteRow,
  StudentLocationRow,
  StudentMembershipRow,
  StudentProfile,
  StudentWorkoutProgramsResponse,
  SupportTicketRow,
  TodayWorkoutResponse,
  UploadResponse,
  WorkoutConsistencyResponse,
  WorkoutSessionResponse
} from "../../types";
import { WorkoutOnboarding, type WorkoutOnboardingSubmitPayload } from "../onboarding/WorkoutOnboarding";
import { LockedOverlay } from "./LockedOverlay";
import { PhysicalAssessmentFormView } from "../shared/PhysicalAssessmentFormView";
import type { WorkoutPlayerExercise } from "./WorkoutPlayer";

const WorkoutPlayer = lazy(async () => {
  const module = await import("./WorkoutPlayer");
  return { default: module.WorkoutPlayer };
});

`
);

// --- thin App.tsx ---
write(
  "App.tsx",
  `import { LogIn } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AuthUser } from "@app-treino/shared";
import { levelLabel } from "./onboarding/onboarding.schema";
import { ApiError, apiGet, apiPost, setUnauthorizedHandler } from "./api";
import { AdminView } from "./components/admin/AdminView";
import { LoginView } from "./components/auth/LoginView";
import { HomeView } from "./components/home/HomeView";
import { UserView } from "./components/student/UserView";
import type { WorkoutOnboardingSubmitPayload } from "./components/onboarding/WorkoutOnboarding";
import { assetUrl } from "./lib/urls";
import type { AuthMode, PlanCode, View } from "./types/auth";

${exportFunctions(slice(1344, 1660))}`
);

console.log("Split complete.");
