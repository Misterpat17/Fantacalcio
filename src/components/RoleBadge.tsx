import { RUOLO_COLOR, RUOLO_LABEL, Ruolo } from "@/lib/types";

export function RoleBadge({ ruolo, size = "md" }: { ruolo: Ruolo; size?: "sm" | "md" | "lg" }) {
  const c = RUOLO_COLOR[ruolo];
  const sizeClass = size === "sm" ? "text-[11px] px-1.5 py-0.5" : size === "lg" ? "text-sm px-3 py-1" : "text-xs px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-bold uppercase tracking-wide ${c.bg} ${c.text} ${c.border} ${sizeClass}`}
      title={RUOLO_LABEL[ruolo]}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {ruolo}
    </span>
  );
}
