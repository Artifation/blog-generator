export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
    >
      <path
        d="M16 2 L17.8 13.2 L29 14 L17.8 14.8 L16 26 L14.2 14.8 L3 14 L14.2 13.2 Z"
        fill="currentColor"
      />
      <path
        d="M16 4 L22 10 L28 16 L22 22 L16 28 L10 22 L4 16 L10 10 Z"
        stroke="currentColor"
        strokeWidth="0.6"
        opacity="0.35"
        fill="none"
      />
    </svg>
  );
}
