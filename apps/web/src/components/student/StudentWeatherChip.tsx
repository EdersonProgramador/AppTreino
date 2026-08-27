import { Cloud, CloudLightning, CloudRain, CloudSun, Snowflake, Sun } from "lucide-react";
import { adviceForSport, type WeatherSnapshot } from "../../lib/weather";

const ICONS = {
  sun: Sun,
  "cloud-sun": CloudSun,
  cloud: Cloud,
  "cloud-rain": CloudRain,
  "cloud-lightning": CloudLightning,
  snowflake: Snowflake
};

type Props = {
  weather: WeatherSnapshot | null;
  sport?: "RUN" | "WALK" | "RIDE" | "WORKOUT" | null;
  compact?: boolean;
};

export function StudentWeatherChip({ weather, sport = null, compact = false }: Props) {
  if (!weather) return null;
  const Icon = ICONS[weather.icon] ?? CloudSun;
  const advice = adviceForSport(sport, weather);
  if (compact) {
    return (
      <span className="student-weather-chip">
        <Icon size={16} />
        <strong>{weather.tempC}°</strong>
        <em>{weather.label}</em>
      </span>
    );
  }
  return (
    <article className="student-weather-card">
      <div>
        <span className="student-weather-icon">
          <Icon size={22} />
        </span>
        <div>
          <small>Clima agora</small>
          <strong>
            {weather.tempC}° · {weather.label}
          </strong>
          <p>
            Sensação {weather.apparentC}° · Vento {weather.windKmh} km/h · Umidade {weather.humidity}%
          </p>
        </div>
      </div>
      <p>{advice}</p>
    </article>
  );
}
