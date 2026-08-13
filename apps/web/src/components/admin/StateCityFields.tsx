import { useEffect, useState } from "react";
import { BRAZILIAN_STATES, CITIES_BY_STATE } from "../../brazil-data";

type StateCityFieldsProps = {
  stateDefault?: string | null;
  cityDefault?: string | null;
  disabled?: boolean;
  withLabels?: boolean;
};

export function StateCityFields({
  stateDefault,
  cityDefault,
  disabled = false,
  withLabels = false
}: StateCityFieldsProps) {
  const [uf, setUf] = useState(stateDefault ?? "");
  const [city, setCity] = useState(cityDefault ?? "");

  useEffect(() => {
    setUf(stateDefault ?? "");
    setCity(cityDefault ?? "");
  }, [stateDefault, cityDefault]);

  const cities = CITIES_BY_STATE[uf] ?? [];

  const stateSelect = (
    <select
      name="state"
      value={uf}
      onChange={(event) => {
        const nextUf = event.target.value;
        setUf(nextUf);
        const nextCities = CITIES_BY_STATE[nextUf] ?? [];
        setCity((current) => (nextCities.includes(current) ? current : ""));
      }}
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
      value={city}
      onChange={(event) => setCity(event.target.value)}
      disabled={disabled || !uf}
    >
      <option value="">{uf ? "Selecione a cidade" : "Selecione o estado primeiro"}</option>
      {city && !cities.includes(city) && <option value={city}>{city}</option>}
      {cities.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </select>
  );

  if (withLabels) {
    return (
      <>
        <label>
          Estado (UF)
          {stateSelect}
        </label>
        <label>
          Cidade
          {citySelect}
        </label>
      </>
    );
  }

  return (
    <>
      {stateSelect}
      {citySelect}
    </>
  );
}
