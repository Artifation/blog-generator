import Link from "next/link";
import { LogoMark } from "~/components/brand/logo-mark";

export default function NotFound() {
  return (
    <div className="err-page">
      <div className="err-card">
        <span className="err-logo">
          <LogoMark size={40} />
        </span>
        <div className="err-code">404</div>
        <h1>Pagina niet gevonden</h1>
        <p>
          Deze pagina bestaat niet (meer). Mogelijk is de link verouderd of is de
          post verwijderd.
        </p>
        <div className="err-actions">
          <Link href="/dashboard" className="btn btn-primary">
            Naar dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
