export default function Avatar({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-black text-ink"
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.45 }}
    >
      {initial}
    </span>
  );
}
