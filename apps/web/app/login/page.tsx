import { AuthSide } from "~/components/brand/auth-side";
import { LoginForm } from "./login-form";
import { listSitesWithStats } from "~/lib/sites";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const sites = await listSitesWithStats();
  const demoSites = sites.slice(0, 3).map((s) => ({ slug: s.slug, name: s.name, domain: s.domain }));

  return (
    <div className="auth-shell">
      <AuthSide />
      <div className="auth-main">
        <LoginForm demoSites={demoSites} />
      </div>
    </div>
  );
}
