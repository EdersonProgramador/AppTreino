import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OnboardingFormValues } from "../components/onboarding/onboarding.schema";

type OnboardingDraft = Partial<OnboardingFormValues>;

type OnboardingState = {
  step: number;
  draft: OnboardingDraft;
  setStep: (step: number) => void;
  patchDraft: (values: OnboardingDraft) => void;
  reset: () => void;
};

const initialDraft: OnboardingDraft = {
  goal: "hypertrophy",
  level: "beginner",
  daysPerWeek: "4",
  equipment: ["gym"],
  billingType: "UNDEFINED"
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      step: 1,
      draft: initialDraft,
      setStep: (step) => set({ step: Math.min(4, Math.max(1, step)) }),
      patchDraft: (values) =>
        set((state) => ({
          draft: {
            ...state.draft,
            ...values
          }
        })),
      reset: () => set({ step: 1, draft: initialDraft })
    }),
    {
      name: "app-treino-onboarding-draft"
    }
  )
);
