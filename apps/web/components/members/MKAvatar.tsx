import Image from "next/image";
import { cn } from "@/lib/utils";

interface MKAvatarProps {
  name: string;
  firstName?: string | null;
  photoUrl?: string | null;
  seed: number;
  size?: number;
  className?: string;
}

// Civic palette — muted Mediterranean tones that harmonize with the navy + amber theme.
// Each pair is [background, foreground]; foreground is a warm cream against every bg.
const PALETTE: Array<[string, string]> = [
  ["#8a6f47", "#fbf3e6"], // sand
  ["#4d6a6d", "#eaf5f5"], // teal-slate
  ["#945a4a", "#fbe9e3"], // terracotta
  ["#5b6478", "#eef0f6"], // dusty slate
  ["#6f7a4a", "#f3f6e2"], // olive
  ["#7a5a72", "#f6eaf2"], // dusty rose
];

function pickColor(seed: number): [string, string] {
  const idx = Math.abs(seed) % PALETTE.length;
  return PALETTE[idx];
}

function initial(name: string, firstName?: string | null): string {
  const candidate = (firstName ?? name ?? "").trim();
  return candidate.length > 0 ? candidate.charAt(0) : "?";
}

// Open Knesset's CSV uses generic placeholder URLs (Male/Female_portrait_placeholder...)
// when no real photo is on file. Treat those as missing so we render initials instead.
function isRealPhoto(url: string | null | undefined): url is string {
  if (!url) return false;
  return !/placeholder/i.test(url);
}

export function MKAvatar({
  name,
  firstName,
  photoUrl,
  seed,
  size = 48,
  className,
}: MKAvatarProps) {
  const dim = `${size}px`;

  if (isRealPhoto(photoUrl)) {
    return (
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-full border border-border bg-muted",
          className,
        )}
        style={{ width: dim, height: dim }}
      >
        <Image
          src={photoUrl}
          alt={name}
          fill
          unoptimized
          className="object-cover"
          sizes={dim}
        />
      </div>
    );
  }

  const [bg, fg] = pickColor(seed);
  // Scale initial relative to avatar size — feels balanced at 44% of width.
  const fontSize = Math.round(size * 0.44);

  return (
    <div
      className={cn(
        "shrink-0 select-none rounded-full border border-border flex items-center justify-center font-semibold",
        className,
      )}
      style={{
        width: dim,
        height: dim,
        background: bg,
        color: fg,
        fontSize,
        lineHeight: 1,
      }}
      aria-label={name}
    >
      {initial(name, firstName)}
    </div>
  );
}
