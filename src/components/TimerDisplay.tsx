export function TimerDisplay({ remainingMs, size = "lg" }: { remainingMs: number | null; size?: "md" | "lg" | "xl" }) {
  if (remainingMs === null) return null;
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  const label = `${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
  const urgent = totalSeconds <= 5;
  const warn = totalSeconds <= 10 && !urgent;

  const sizeClass = size === "xl" ? "text-7xl" : size === "lg" ? "text-5xl" : "text-3xl";
  const colorClass = urgent ? "text-rose-500" : warn ? "text-amber-400" : "text-sky-400";

  return (
    <div
      className={`font-mono font-black tabular-nums ${sizeClass} ${colorClass} ${urgent ? "timer-pulse" : ""} inline-flex rounded-2xl px-4 py-1`}
    >
      {label}
    </div>
  );
}
