"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LogoMark } from "~/components/brand/logo-mark";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the failure in the browser console; server-side it is already
    // captured by the errors store / instrumentation.
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="err-page">
      <div className="err-card">
        <span className="err-logo">
          <LogoMark size={40} />
        </span>
        <h1>Er ging iets mis</h1>
        <p>
          Er trad een onverwachte fout op bij het laden van deze pagina. Probeer
          het opnieuw — als het probleem aanhoudt, laat het ons weten.
        </p>
        <div className="err-actions">
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            Opnieuw proberen
          </button>
          <Link href="/dashboard" className="btn btn-outline">
            Naar dashboard
          </Link>
        </div>
        {error.digest && <div className="err-digest">Referentie: {error.digest}</div>}
      </div>
    </div>
  );
}
