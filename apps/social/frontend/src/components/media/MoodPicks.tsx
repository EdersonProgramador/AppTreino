import { MOODS, MoodId } from "@/lib/moods";

interface MoodPicksProps {
  value?: string;
  onChange: (mood: MoodId) => void;
}

export function MoodPicks({ value, onChange }: MoodPicksProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {MOODS.map(mood => (
        <button
          key={mood.id}
          type="button"
          className={`rounded-full border-0 px-3 py-1.5 text-xs font-medium ${value === mood.id ? "bg-brand text-white" : "bg-mist text-ink"}`}
          onClick={() => onChange(mood.id)}
        >
          {mood.emoji} {mood.label}
        </button>
      ))}
    </div>
  );
}
