import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import {
  EQUIPMENT_OPTIONS,
  ONBOARDING_STEP_FIELDS,
  TRAINING_GOALS,
  TRAINING_LEVELS,
  birthDateFromYear,
  goalLabel,
  levelLabel,
  onboardingSchema,
  registerOnboardingSchema,
  suggestProgramBlurb,
  type OnboardingFormValues
} from "./onboarding.schema";
import { useOnboardingStore } from "../../stores/onboardingStore";

export type WorkoutOnboardingMode = "register" | "complete";

export type WorkoutOnboardingSubmitPayload = OnboardingFormValues & {
  birthDate: string;
  objective: string;
  daysPerWeekNumber: number;
};

type WorkoutOnboardingProps = {
  mode: WorkoutOnboardingMode;
  submitting?: boolean;
  error?: string | null;
  selectedPlanName?: string | null;
  requirePassword?: boolean;
  initialValues?: Partial<OnboardingFormValues>;
  onSubmit: (payload: WorkoutOnboardingSubmitPayload) => Promise<void> | void;
  onCancel?: () => void;
};

export function WorkoutOnboarding({
  mode,
  submitting = false,
  error = null,
  selectedPlanName = null,
  requirePassword = mode === "register",
  initialValues,
  onSubmit,
  onCancel
}: WorkoutOnboardingProps) {
  const step = useOnboardingStore((state) => state.step);
  const draft = useOnboardingStore((state) => state.draft);
  const setStep = useOnboardingStore((state) => state.setStep);
  const patchDraft = useOnboardingStore((state) => state.patchDraft);
  const resetDraft = useOnboardingStore((state) => state.reset);

  const defaultValues = useMemo<OnboardingFormValues>(
    () => ({
      name: "",
      email: "",
      phone: "",
      password: "",
      gender: undefined as unknown as OnboardingFormValues["gender"],
      birthYear: "",
      goal: "hypertrophy",
      daysPerWeek: "4",
      level: "beginner",
      equipment: ["gym"],
      billingType: "UNDEFINED",
      ...draft,
      ...initialValues
    }),
    [draft, initialValues]
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    getValues,
    formState: { errors }
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(requirePassword ? registerOnboardingSchema : onboardingSchema) as never,
    mode: "onChange",
    defaultValues
  });

  const selectedGoal = watch("goal");
  const selectedLevel = watch("level");
  const selectedEquipment = watch("equipment") ?? [];
  const selectedGender = watch("gender");
  const selectedDays = watch("daysPerWeek");

  useEffect(() => {
    const subscription = watch((values) => {
      patchDraft(values as Partial<OnboardingFormValues>);
    });
    return () => subscription.unsubscribe();
  }, [watch, patchDraft]);

  async function handleNext() {
    const fields = ONBOARDING_STEP_FIELDS[step as 1 | 2 | 3];
    const isValid = await trigger(fields);
    if (isValid) {
      setStep(step + 1);
    }
  }

  async function handleFinalSubmit(values: OnboardingFormValues) {
    await onSubmit({
      ...values,
      birthDate: birthDateFromYear(values.birthYear),
      objective: goalLabel(values.goal),
      daysPerWeekNumber: Number(values.daysPerWeek)
    });
    resetDraft();
  }

  function toggleEquipment(id: OnboardingFormValues["equipment"][number]) {
    const current = getValues("equipment") ?? [];
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    setValue("equipment", next, { shouldValidate: true, shouldDirty: true });
  }

  return (
    <div className="mt-5 grid animate-fade-up gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-brand-gold">
            {mode === "register" ? "Monte seu treino" : "Complete seu perfil"}
          </h2>
          <p className="mt-1 text-xs text-sand-muted">Etapa {step} de 4</p>
        </div>
        {onCancel && (
          <button type="button" className="ui-btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>

      {selectedPlanName && (
        <div className="grid gap-1.5 rounded-xl border border-brand-gold/30 bg-brand-gold/10 p-3.5">
          <span className="text-xs font-extrabold text-sand-muted">Plano selecionado</span>
          <strong className="text-sand">{selectedPlanName}</strong>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2" aria-hidden="true">
        {[1, 2, 3, 4].map((item) => (
          <span
            key={item}
            className={`h-1.5 rounded-full transition ${step >= item ? "bg-brand-gold" : "bg-[var(--app-fill-strong)]"}`}
          />
        ))}
      </div>

      <form className="grid gap-3.5" onSubmit={handleSubmit(handleFinalSubmit)}>
        {step === 1 && (
          <div className="grid gap-3.5">
            <label className="ui-label">
              Nome completo
              <input {...register("name")} className="ui-input" placeholder="Seu nome" autoComplete="name" />
              {errors.name && <span className="text-xs font-bold text-[#ff8f7a]">{errors.name.message}</span>}
            </label>
            <label className="ui-label">
              E-mail
              <input
                {...register("email")}
                className="ui-input"
                type="email"
                placeholder="seu@email.com"
                autoComplete="email"
              />
              {errors.email && <span className="text-xs font-bold text-[#ff8f7a]">{errors.email.message}</span>}
            </label>
            <label className="ui-label">
              Telefone
              <input
                {...register("phone")}
                className="ui-input"
                type="tel"
                placeholder="+55 11 99999-9999"
                autoComplete="tel"
              />
              {errors.phone && <span className="text-xs font-bold text-[#ff8f7a]">{errors.phone.message}</span>}
            </label>
            {requirePassword && (
              <label className="ui-label">
                Senha
                <input
                  {...register("password")}
                  className="ui-input"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                />
                {errors.password && <span className="text-xs font-bold text-[#ff8f7a]">{errors.password.message}</span>}
              </label>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-3.5">
            <label className="ui-label">
              Sexo
              <select {...register("gender")} className="ui-input" defaultValue="">
                <option value="" disabled>
                  Selecione
                </option>
                <option value="MALE">Masculino</option>
                <option value="FEMALE">Feminino</option>
              </select>
              {errors.gender && <span className="text-xs font-bold text-[#ff8f7a]">{errors.gender.message}</span>}
            </label>

            <label className="ui-label">
              Ano de nascimento
              <input
                {...register("birthYear")}
                className="ui-input"
                inputMode="numeric"
                placeholder="Ex.: 1995"
                maxLength={4}
              />
              {errors.birthYear && <span className="text-xs font-bold text-[#ff8f7a]">{errors.birthYear.message}</span>}
            </label>

            <div className="grid gap-2.5">
              <span className="text-sm font-extrabold text-sand">Qual seu objetivo principal?</span>
              <div className="grid gap-2">
                {TRAINING_GOALS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`ui-choice ${selectedGoal === item.id ? "ui-choice-active" : ""}`}
                    onClick={() => setValue("goal", item.id, { shouldValidate: true })}
                  >
                    <span>{item.label}</span>
                    {selectedGoal === item.id && <Check size={16} />}
                  </button>
                ))}
              </div>
              {errors.goal && <span className="text-xs font-bold text-[#ff8f7a]">{errors.goal.message}</span>}
            </div>

            <label className="ui-label">
              Dias por semana
              <select {...register("daysPerWeek")} className="ui-input">
                <option value="3">3 dias por semana</option>
                <option value="4">4 dias por semana</option>
                <option value="5">5 dias por semana</option>
                <option value="6">6 dias por semana</option>
              </select>
              {errors.daysPerWeek && (
                <span className="text-xs font-bold text-[#ff8f7a]">{errors.daysPerWeek.message}</span>
              )}
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-3.5">
            <div className="grid gap-2.5">
              <span className="text-sm font-extrabold text-sand">Qual o seu nível de experiência?</span>
              <div className="grid gap-2">
                {TRAINING_LEVELS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`ui-choice flex-col items-start ${selectedLevel === item.id ? "ui-choice-active" : ""}`}
                    onClick={() => setValue("level", item.id, { shouldValidate: true })}
                  >
                    <strong className="text-sm text-sand">{item.label}</strong>
                    <small className="text-xs text-sand-muted">{item.desc}</small>
                  </button>
                ))}
              </div>
              {errors.level && <span className="text-xs font-bold text-[#ff8f7a]">{errors.level.message}</span>}
            </div>

            <div className="grid gap-2.5">
              <span className="text-sm font-extrabold text-sand">Quais equipamentos você tem disponíveis?</span>
              <div className="grid gap-2">
                {EQUIPMENT_OPTIONS.map((item) => {
                  const active = selectedEquipment.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`ui-choice ${active ? "ui-choice-active" : ""}`}
                      onClick={() => toggleEquipment(item.id)}
                    >
                      <span>{item.label}</span>
                      {active && <Check size={16} />}
                    </button>
                  );
                })}
              </div>
              {errors.equipment && <span className="text-xs font-bold text-[#ff8f7a]">{errors.equipment.message}</span>}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-3.5">
            <div className="grid gap-3 rounded-2xl border border-brand-gold/30 bg-brand-gold/10 p-4">
              <h3 className="font-display text-base text-sand">Confirmação do perfil</h3>
              <ul className="grid gap-2">
                <li className="flex justify-between gap-3 text-sm text-sand-muted">
                  <span>Objetivo</span>
                  <strong className="text-right text-sand">{goalLabel(selectedGoal)}</strong>
                </li>
                <li className="flex justify-between gap-3 text-sm text-sand-muted">
                  <span>Nível</span>
                  <strong className="text-right text-sand">{levelLabel(selectedLevel)}</strong>
                </li>
                <li className="flex justify-between gap-3 text-sm text-sand-muted">
                  <span>Frequência</span>
                  <strong className="text-right text-sand">{selectedDays} dias/semana</strong>
                </li>
                <li className="flex justify-between gap-3 text-sm text-sand-muted">
                  <span>Público</span>
                  <strong className="text-right text-sand">
                    {selectedGender === "FEMALE" ? "Feminino" : "Masculino"}
                  </strong>
                </li>
              </ul>
              <p className="text-sm leading-relaxed text-sand">{suggestProgramBlurb(getValues())}</p>
            </div>

            {mode === "register" && selectedPlanName && (
              <label className="ui-label">
                Pagamento
                <select {...register("billingType")} className="ui-input">
                  <option value="UNDEFINED">Escolher no checkout</option>
                  <option value="PIX">Pix</option>
                  <option value="CREDIT_CARD">Cartão</option>
                </select>
              </label>
            )}
          </div>
        )}

        <div className="mt-2 flex gap-2.5">
          {step > 1 && (
            <button
              type="button"
              className="ui-btn-secondary w-1/3"
              onClick={() => setStep(step - 1)}
              disabled={submitting}
            >
              <ChevronLeft size={16} />
              Voltar
            </button>
          )}

          {step < 4 ? (
            <button type="button" className="ui-btn-primary flex-1" onClick={() => void handleNext()}>
              Avançar
              <ChevronRight size={16} />
            </button>
          ) : (
            <button type="submit" className="ui-btn-primary flex-1" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" size={18} /> : null}
              {mode === "register" ? "Criar conta e liberar treinos" : "Salvar perfil e ver treinos"}
            </button>
          )}
        </div>
      </form>

      {error && <div className="ui-error">{error}</div>}
    </div>
  );
}
