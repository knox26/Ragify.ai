import { useId } from "react";

/**
 * RagifyMark — the brand mark.
 *
 * The citation asterisk. Ragify's signature device is the footnote marker on
 * cited answers, so the mark is a 6-arm asterisk whose vertical "spine" runs
 * blue → magenta with a magenta pin at the tip. Diagonals take currentColor,
 * so the mark works on any surface.
 *
 * Two tones:
 *  - "surface" (default) — for light/neutral tiles: spine is accent → magenta.
 *  - "accent" — for solid accent tiles: spine is white → magenta (blue-on-blue
 *    would disappear).
 */

interface RagifyMarkProps {
  className?: string;
  tone?: "surface" | "accent";
}

export function RagifyMark({ className, tone = "surface" }: RagifyMarkProps) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const from = tone === "accent" ? "#fff" : "var(--accent)";

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gid}
          x1="12"
          y1="4"
          x2="12"
          y2="20"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={from} />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      {/* diagonal arms */}
      <path
        d="M8 5 L16 19"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M8 19 L16 5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* spine — the cited accent */}
      <path
        d="M12 4.5 L12 20"
        stroke={`url(#${gid})`}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* citation pin */}
      <circle cx="12" cy="3" r="1.6" fill="var(--accent-2)" />
    </svg>
  );
}
