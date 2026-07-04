import { AuthSide } from "~/components/brand/auth-side";
import { ActivateForm } from "./activate-form";

export const dynamic = "force-dynamic";

export default function ActivatePage() {
  // Never list invite codes to the client — that leaked every valid code (and
  // real customer company names) to anyone who opened /activate. Users type the
  // code they were given.
  return (
    <div className="auth-shell">
      <AuthSide />
      <div className="auth-main">
        <ActivateForm codes={[]} />
      </div>
    </div>
  );
}
