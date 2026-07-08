"use client";

import { useEffect } from "react";

/**
 * Root error boundary. Renders when the root layout itself throws, so it must
 * supply its own <html>/<body> and cannot rely on globals.css being loaded —
 * styles are inlined and brand colours hardcoded (navy #0B1B3B, blue #3B82F6).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Fatal app error:", error);
  }, [error]);

  return (
    <html lang="nl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#FFFFFF",
          color: "#0B1B3B",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              margin: "0 0 10px",
              letterSpacing: "-0.02em",
            }}
          >
            Er ging iets mis
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#5B6471",
              lineHeight: 1.6,
              margin: "0 0 24px",
            }}
          >
            De applicatie kon niet geladen worden. Probeer het opnieuw of herlaad
            de pagina.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "10px 18px",
              borderRadius: 7,
              border: "none",
              background: "#0B1B3B",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Opnieuw proberen
          </button>
          {error.digest && (
            <div
              style={{
                marginTop: 22,
                fontSize: 11,
                color: "#8B95A3",
                fontFamily: "monospace",
                wordBreak: "break-all",
              }}
            >
              Referentie: {error.digest}
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
