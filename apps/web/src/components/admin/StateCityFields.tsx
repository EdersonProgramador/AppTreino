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

  useEffect(() => {
    setUf(stateDefault ?? "");
  }, [stateDefault]);

  const stateSelect = (
    <select
      name="state"
      defaultValue={stateDefault ?? ""}
      onChange={(event) => setUf(event.target.value)}
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
    <select name="city" defaultValue={cityDefault ?? ""} disabled={disabled}>
      <option value="">Selecione a cidade</option>
      {cityDefault &&
        uf === (stateDefault ?? "") &&
        !(CITIES_BY_STATE[uf] ?? []).includes(cityDefault) && (
          <option value={cityDefault}>{cityDefault}</option>
        )}
      {(CITIES_BY_STATE[uf] ?? []).map((city) => (
        <option key={city} value={city}>
          {city}
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
