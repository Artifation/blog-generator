"use client";

import { Search } from "lucide-react";

export function TopbarSearch() {
  return (
    <button className="icon-btn" aria-label="Zoeken" onClick={() => alert("Zoeken komt later — gebruik nu de sidebar.")}>
      <Search size={16} />
    </button>
  );
}
