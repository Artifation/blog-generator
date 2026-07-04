"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

/**
 * Hamburger that turns the fixed admin sidebar into an off-canvas drawer on
 * small screens. Hidden on desktop via CSS (`.nav-hamburger`). Toggles a
 * `data-nav-open` attribute on <body> that the stylesheet uses to slide the
 * sidebar in/out, and closes automatically on navigation.
 */
export function MobileNavToggle() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Reflect open state on <body> so pure CSS drives the drawer + backdrop.
  React.useEffect(() => {
    document.body.dataset.navOpen = open ? "true" : "false";
    return () => {
      document.body.dataset.navOpen = "false";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="nav-hamburger icon-btn"
        aria-label={open ? "Sluit menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>
      {open && (
        <div className="nav-backdrop" aria-hidden onClick={() => setOpen(false)} />
      )}
    </>
  );
}
