import { OnboardingWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "40px 20px" }}>
      <div className="wizard">
        <OnboardingWizard />
      </div>
    </div>
  );
}
