export function calculateBodyFatEstimate(input: {
  gender?: string;
  heightCm?: number | null;
  neckCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  weightKg?: number | null;
  birthDate?: string;
}): { value: number; method: "Navy" | "IMC" } | null {
  const { gender, heightCm, neckCm, waistCm, hipCm } = input;
  const isMale = gender === "Masculino";
  const isFemale = gender === "Feminino";

  if ((!isMale && !isFemale) || !heightCm || !neckCm || !waistCm || heightCm <= 0 || neckCm <= 0 || waistCm <= 0) {
    return null;
  }

  const log10 = Math.log10;

  if (isMale) {
    if (waistCm - neckCm > 0) {
      const bodyFat = 495 / (1.0324 - 0.19077 * log10(waistCm - neckCm) + 0.15456 * log10(heightCm)) - 450;
      return { value: Math.max(0, Math.min(100, Math.round(bodyFat * 10) / 10)), method: "Navy" };
    }
  } else if (hipCm && hipCm > 0 && waistCm + hipCm - neckCm > 0) {
    const bodyFat =
      495 / (1.29579 - 0.35004 * log10(waistCm + hipCm - neckCm) + 0.221 * log10(heightCm)) - 450;
    return { value: Math.max(0, Math.min(100, Math.round(bodyFat * 10) / 10)), method: "Navy" };
  }

  const { weightKg, birthDate } = input;
  if (!weightKg || weightKg <= 0) return null;

  const bmi = weightKg / Math.pow(heightCm / 100, 2);
  let age = 0;
  if (birthDate) {
    const born = new Date(`${birthDate}T00:00:00`);
    if (!Number.isNaN(born.getTime())) {
      const today = new Date();
      age = today.getFullYear() - born.getFullYear();
      const monthDiff = today.getMonth() - born.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) age -= 1;
    }
  }
  const bodyFat = 1.2 * bmi + 0.23 * age - 10.8 * (isMale ? 1 : 0) - 5.4;
  return { value: Math.max(0, Math.min(100, Math.round(bodyFat * 10) / 10)), method: "IMC" };
}
