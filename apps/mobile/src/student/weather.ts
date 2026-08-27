import * as Location from "expo-location";
import type { OutdoorSport } from "../types";

export type WeatherSnapshot = {
  tempC: number;
  apparentC: number;
  code: number;
  label: string;
  icon: "sunny-outline" | "partly-sunny-outline" | "cloudy-outline" | "rainy-outline" | "thunderstorm-outline" | "snow-outline";
  windKmh: number;
  humidity: number;
  advice: string;
  capturedAt: string;
  lat: number;
  lng: number;
};

type Cache = { at: number; snap: WeatherSnapshot };
let cache: Cache | null = null;
const CACHE_MS = 12 * 60 * 1000;

function labelForCode(code: number) {
  if (code === 0) return "Céu limpo";
  if (code <= 2) return "Parcialmente nublado";
  if (code === 3) return "Nublado";
  if (code <= 48) return "Neblina";
  if (code <= 57) return "Garoa";
  if (code <= 67) return "Chuva";
  if (code <= 77) return "Neve";
  if (code <= 82) return "Pancadas";
  if (code <= 86) return "Neve forte";
  return "Trovoada";
}

function iconForCode(code: number): WeatherSnapshot["icon"] {
  if (code === 0) return "sunny-outline";
  if (code <= 2) return "partly-sunny-outline";
  if (code <= 48) return "cloudy-outline";
  if (code <= 67 || code <= 82) return "rainy-outline";
  if (code <= 86) return "snow-outline";
  return "thunderstorm-outline";
}

export function adviceForSport(sport: OutdoorSport | "WORKOUT" | null, snap: WeatherSnapshot | null) {
  if (!snap) return "Clima em tempo real no local do treino.";
  const { tempC, code, windKmh } = snap;
  if (code >= 95) return "Tempestade no local. Prefira treino indoor.";
  if (code >= 80) return "Chuva no caminho. Atenção ao piso molhado.";
  if (tempC >= 33) return sport === "RIDE" ? "Calor forte. Hidrate e evite o pico do sol." : "Calor intenso. Reduza o ritmo e hidrate.";
  if (tempC <= 8) return "Frio. Aqueça bem antes de começar.";
  if (windKmh >= 35 && sport === "RIDE") return "Vento forte. Cuidado em descidas e trechos abertos.";
  if (sport === "WALK") return "Bom clima para caminhar com consistência.";
  if (sport === "RIDE") return "Condições boas para pedalar.";
  if (sport === "WORKOUT") return "Clima ok. Treino de força rende melhor indoor.";
  return "Boas condições para correr.";
}

export async function fetchWeather(lat: number, lng: number, sport: OutdoorSport | "WORKOUT" | null = null): Promise<WeatherSnapshot | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return { ...cache.snap, advice: adviceForSport(sport, cache.snap) };
  }
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m` +
    `&timezone=auto`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = (await response.json()) as {
    current?: {
      temperature_2m?: number;
      apparent_temperature?: number;
      weather_code?: number;
      wind_speed_10m?: number;
      relative_humidity_2m?: number;
    };
  };
  const current = data.current;
  if (current?.temperature_2m == null) return null;
  const code = current.weather_code ?? 0;
  const snap: WeatherSnapshot = {
    tempC: Math.round(current.temperature_2m),
    apparentC: Math.round(current.apparent_temperature ?? current.temperature_2m),
    code,
    label: labelForCode(code),
    icon: iconForCode(code),
    windKmh: Math.round(current.wind_speed_10m ?? 0),
    humidity: Math.round(current.relative_humidity_2m ?? 0),
    advice: "",
    capturedAt: new Date().toISOString(),
    lat,
    lng
  };
  snap.advice = adviceForSport(sport, snap);
  cache = { at: Date.now(), snap };
  return snap;
}

export async function fetchWeatherHere(sport: OutdoorSport | "WORKOUT" | null = null): Promise<WeatherSnapshot | null> {
  try {
    const last = await Location.getLastKnownPositionAsync();
    const coords = last?.coords ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })).coords;
    return fetchWeather(coords.latitude, coords.longitude, sport);
  } catch {
    return null;
  }
}
