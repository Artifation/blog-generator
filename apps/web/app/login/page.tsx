import { AuthSide } from "~/components/brand/auth-side";
import { LoginForm } from "./login-form";
import { listSitesWithStats } from "~/lib/sites";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Demo one-click logins zijn alleen handig in dev. In production tonen
  // we ze niet — de server-side loginAction blokkeert ze sowieso, maar de
  // UI moet ze dan ook niet meer adverteren.
  const showDemo = process.env.NODE_ENV !== "production";
  const demoSites = showDemo
    ? (await listSitesWithStats())
        .slice(0, 3)
        .map((s) => ({ slug: s.slug, name: s.name, domain: s.domain }))
    : [];

  return (
    <div className="auth-shell">
      <AuthSide />
      <div className="auth-main">
        <LoginForm demoSites={demoSites} />
      </div>
    </div>
  );
}
