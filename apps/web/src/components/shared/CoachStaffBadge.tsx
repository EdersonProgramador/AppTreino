import { ShieldCheck } from "lucide-react";

type Props = {
  variant?: "coach" | "nutritionist" | "staff";
  compact?: boolean;
};

const LABELS = {
  coach: "Coach ATLLY",
  nutritionist: "Nutricionista ATLLY",
  staff: "Profissional ATLLY"
} as const;

export function CoachStaffBadge({ variant = "coach", compact = false }: Props) {
  return (
    <span
      className={`coach-staff-badge coach-staff-badge--${variant}${compact ? " coach-staff-badge--compact" : ""}`}
      title={LABELS[variant]}
    >
      <ShieldCheck size={compact ? 12 : 14} aria-hidden="true" />
      {LABELS[variant]}
    </span>
  );
}
