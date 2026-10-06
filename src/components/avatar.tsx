import { cn } from "@/lib/utils";
export function Avatar({
  name,
  small = false,
}: {
  name: string;
  small?: boolean;
}) {
  const colors = [
    "bg-[#e0e9ff] text-[#1e3a8a]",
    "bg-[#e3f3ea] text-[#14532d]",
    "bg-[#fdf0d6] text-[#7a4a06]",
    "bg-[#f6e3ef] text-[#7a1f4f]",
  ];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-[11px] font-medium",
        small ? "size-8" : "size-9",
        colors[name.charCodeAt(0) % colors.length],
      )}
    >
      {name
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join("")}
    </span>
  );
}
