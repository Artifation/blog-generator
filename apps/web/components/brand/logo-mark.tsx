/**
 * Het echte Artifation-logo (icon-only, transparante achtergrond). De blauwe
 * icon is zichtbaar op zowel donkere als lichte achtergronden, dus we
 * gebruiken overal dezelfde transparante variant. (De "wit"-variant had een
 * wit vierkant ingebakken — gaf een lelijke witte box op donkere panels.)
 *
 * `variant` wordt genegeerd maar blijft als prop voor backwards-compat met
 * bestaande call-sites.
 */
export function LogoMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
  variant?: "dark" | "light";
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-icon.svg"
      width={size}
      height={size}
      alt="Artifation"
      className={className}
      style={{ display: "block" }}
    />
  );
}
