import { AuthSide } from "~/components/brand/auth-side";
import { ActivateForm } from "./activate-form";
import { INVITE_CODES } from "~/lib/auth";

export const dynamic = "force-dynamic";

export default function ActivatePage() {
  const codeList = Object.entries(INVITE_CODES).map(([code, info]) => ({
    code,
    company: info.company,
    plan: info.plan,
  }));

  return (
    <div className="auth-shell">
      <AuthSide />
      <div className="auth-main">
        <ActivateForm codes={codeList} />
      </div>
    </div>
  );
}
