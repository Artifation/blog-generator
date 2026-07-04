import { Search } from "lucide-react";

// Search isn't built yet. Render an honest, disabled affordance instead of a
// live button that fired a jarring native alert() and felt broken.
export function TopbarSearch() {
  return (
    <button
      className="icon-btn"
      type="button"
      disabled
      aria-disabled="true"
      aria-label="Zoeken (binnenkort)"
      title="Zoeken komt binnenkort"
      style={{ cursor: "not-allowed", opacity: 0.5 }}
    >
      <Search size={16} />
    </button>
  );
}
