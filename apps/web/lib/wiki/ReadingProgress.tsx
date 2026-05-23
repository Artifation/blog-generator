"use client";

/**
 * Dunne voortgangsbalk bovenaan de viewport die de scroll-positie t.o.v.
 * het artikel (`.wiki-body`) toont. CSS uit globals.css (.wiki-progress).
 */
import * as React from "react";

export function ReadingProgress({
  containerSelector = ".wiki-body",
}: {
  containerSelector?: string;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const target = document.querySelector<HTMLElement>(containerSelector);
    if (!target) return;

    function update() {
      const rect = target!.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      if (total <= 0) {
        bar!.style.width = "100%";
        return;
      }
      const scrolled = Math.min(Math.max(-rect.top, 0), total);
      const pct = (scrolled / total) * 100;
      bar!.style.width = `${pct}%`;
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [containerSelector]);

  return <div ref={ref} className="wiki-progress" aria-hidden="true" />;
}
