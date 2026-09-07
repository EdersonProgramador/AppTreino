import { useEffect, useState } from "react";
import { BRAZILIAN_STATES, CITIES_BY_STATE } from "../../brazil-data";

type StateCityFieldsProps = {
  stateDefault?: string | null;
  cityDefault?: string | null;
  stateValue?: string;
  cityValue?: string;
  onStateChange?: (value: string) => void;
  onCityChange?: (value: string) => void;
  disabled?: boolean;
  withLabels?: boolean;
  selectClassName?: string;
};

export function StateCityFields({
  stateDefault,
  cityDefault,
  stateValue,
  cityValue,
  onStateChange,
  onCityChange,
  disabled = false,
  withLabels = false,
  selectClassName = ""
}: StateCityFieldsProps) {
  const controlled = onStateChange !== undefined || onCityChange !== undefined;
  const [uf, setUf] = useState(stateValue ?? stateDefault ?? "");
  const [city, setCity] = useState(cityValue ?? cityDefault ?? "");

  useEffect(() => {
    if (controlled) {
      setUf(stateValue ?? "");
      setCity(cityValue ?? "");
      return;
    }
    setUf(stateDefault ?? "");
    setCity(cityDefault ?? "");
  }, [controlled, stateDefault, cityDefault, stateValue, cityValue]);

  const currentUf = controlled ? (stateValue ?? "") : uf;
  const currentCity = controlled ? (cityValue ?? "") : city;
  const cities = CITIES_BY_STATE[currentUf] ?? [];

  const updateUf = (nextUf: string) => {
    const nextCities = CITIES_BY_STATE[nextUf] ?? [];
    const nextCity = nextCities.includes(currentCity) ? currentCity : "";
    if (controlled) {
      onStateChange?.(nextUf);
      if (nextCity !== currentCity) onCityChange?.(nextCity);
      return;
    }
    setUf(nextUf);
    setCity(nextCity);
  };

  const updateCity = (nextCity: string) => {
    if (controlled) {
      onCityChange?.(nextCity);
      return;
    }
    setCity(nextCity);
  };

  const stateSelect = (
    <select
      name="state"
      className={selectClassName}
      value={currentUf}
      onChange={(event) => updateUf(event.target.value)}
      disabled={disabled}
    >
      <option value="">Selecione o estado</option>
      {BRAZILIAN_STATES.map((state) => (
        <option key={state.uf} value={state.uf}>
          {state.name} ({state.uf})
        </option>
      ))}
    </select>
  );

  const citySelect = (
    <select
      name="city"
      className={selectClassName}
      value={currentCity}
      onChange={(event) => updateCity(event.target.value)}
      disabled={disabled || !currentUf}
    >
      <option value="">{currentUf ? "Selecione a cidade" : "Selecione o estado primeiro"}</option>
      {currentCity && !cities.includes(currentCity) && <option value={currentCity}>{currentCity}</option>}
      {cities.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </select>
  );

  if (withLabels) {
    return (
      <div className="grid gap-3">
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-sand-muted">
          Estado (UF)
          {stateSelect}
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-sand-muted">
          Cidade
          {citySelect}
        </label>
      </div>
    );
  }

  return (
    <>
      {stateSelect}
      {citySelect}
    </>
  );
}
