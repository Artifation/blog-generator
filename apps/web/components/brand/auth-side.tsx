import { LogoMark } from "./logo-mark";

export function AuthSide() {
  return (
    <div className="auth-side">
      <div className="auth-brand">
        <LogoMark size={28} variant="light" />
        <span>
          Artifation{" "}
          <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 400 }}>· Blog</span>
        </span>
      </div>
      <div className="auth-pitch">
        <h2>
          Aantoonbaar resultaat —<br />ook in je content.
        </h2>
        <p>
          Zes AI-agents werken samen aan elke post. Jij keurt goed. Jouw bedrijfsverhaal,
          op je eigen blog of WordPress.
        </p>
        <div className="auth-quote">
          <p>
            "We publiceren nu drie keer per week zonder dat onze marketing-stagiair 's avonds
            nog doorwerkt. Eerst dachten we dat de kwaliteit te wisselend zou zijn — de
            quality-judge filtert dat eruit."
          </p>
          <div className="auth-quote-by">— Carla, oprichter Noordzee Digital</div>
        </div>
      </div>
    </div>
  );
}
