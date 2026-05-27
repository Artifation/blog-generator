import { AuthSide } from "~/components/brand/auth-side";
import { ActivateForm } from "./activate-form";
import { INVITE_CODES } from "~/lib/auth";

export const dynamic = "force-dynamic";

export default function ActivatePage() {
  // De invite-codes-lijst is een dev-hint zodat je niet hoeft te onthouden
  // welke code bij welk bedrijf hoort. In production tonen we 'm niet —
  // de form werkt nog steeds (je typt je code), alleen de hint-strip verdwijnt.
  const showCodeHints = process.env.NODE_ENV !== "production";
  const codeList = showCodeHints
    ? Object.entries(INVITE_CODES).map(([code, info]) => ({
        code,
        company: info.company,
        plan: info.plan,
      }))
    : [];

  return (
    <div className="auth-shell">
      <AuthSide />
      <div className="auth-main">
        <ActivateForm codes={codeList} />
      </div>
    </div>
  );
}
