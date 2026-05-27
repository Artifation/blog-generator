/**
 * Het echte Artifation-logo (icon-only variant). Op donkere achtergrond
 * (auth-side, sidebar) ziet de "wit"-variant beter uit; op lichte
 * achtergronden de transparante variant. Pass `variant="light"` om de
 * witte uit /public/logo-icon-wit.svg te gebruiken.
 */
export function LogoMark({
  size = 28,
  className,
  variant = "dark",
}: {
  size?: number;
  className?: string;
  variant?: "dark" | "light";
}) {
  const src = variant === "light" ? "/logo-icon-wit.svg" : "/logo-icon.svg";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={size}
      height={size}
      alt="Artifation"
      className={className}
      style={{ display: "block" }}
    />
  );
}
