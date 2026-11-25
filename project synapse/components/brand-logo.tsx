import React from "react";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: { box: 32, text: "text-[20px]", radius: 9 },
  md: { box: 36, text: "text-[22px]", radius: 10 },
  lg: { box: 42, text: "text-[25px]", radius: 11 },
};

export function BrandLogo({
  size = "md",
  showWordmark = true,
  className = "",
}: BrandLogoProps) {
  const s = SIZE_MAP[size];

  return (
    <span
      className={`inline-flex items-center gap-2.5 select-none ${className}`}
    >
      <span
        style={{
          width: s.box,
          height: s.box,
          borderRadius: s.radius,
          background:
            "linear-gradient(145deg, rgba(28, 30, 34, 0.95), rgba(14, 15, 18, 0.98))",
          border: "1px solid rgba(198, 244, 50, 0.28)",
          boxShadow:
            "inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 0 18px rgba(198, 244, 50, 0.12)",
          display: "inline-grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <svg
          width={Math.round(s.box * 0.66)}
          height={Math.round(s.box * 0.66)}
          viewBox="0 0 28 28"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M19.5 7.5C19.5 5.3 17.2 4 14 4C10.8 4 8.5 5.6 8.5 8.1C8.5 11.4 13.5 12.2 14.5 13.2"
            stroke="#E4E4E7"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <path
            d="M8.5 20.5C8.5 22.7 10.8 24 14 24C17.2 24 19.5 22.4 19.5 19.9C19.5 16.6 14.5 15.8 13.5 14.8"
            stroke="#E4E4E7"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <path
            d="M3.5 14H7.2L9.6 10.5L12.7 17.5L15.6 10.8L18.3 16.2L20.5 14H24.5"
            stroke="#C6F432"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="19.5" cy="7.5" r="1.9" fill="#C6F432" />
          <circle cx="8.5" cy="20.5" r="1.9" fill="#C6F432" />
        </svg>
      </span>

      {showWordmark && (
        <span
          className={`${s.text} font-semibold tracking-[-0.03em] text-white leading-none`}
        >
          Synapse<span className="text-[#C6F432]">Sonic</span>
        </span>
      )}
    </span>
  );
}

export function ElectricLogo({
  size = "lg",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-3 relative ${className}`}>
      <span
        aria-hidden="true"
        className="absolute -inset-2 rounded-2xl opacity-35 blur-md pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 20% 50%, rgba(198,244,50,0.45), transparent 70%)",
        }}
      />
      <BrandLogo size={size} className="relative z-10" />
    </div>
  );
}
