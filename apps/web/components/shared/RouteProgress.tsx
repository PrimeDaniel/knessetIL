"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Top-of-page navigation progress bar.
 * Mounts once in the root layout; animates a thin bar across the top
 * each time the route changes, easing the perceived gap between click
 * and the next page's skeleton.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const isFirstRender = useRef(true);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Cancel any in-flight animation from a previous navigation
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];

    setVisible(true);
    setProgress(0);

    // Sequence: 0 → 90 (eased) → 100 → fade out → reset
    timeouts.current.push(setTimeout(() => setProgress(90), 40));
    timeouts.current.push(setTimeout(() => setProgress(100), 550));
    timeouts.current.push(setTimeout(() => setVisible(false), 850));
    timeouts.current.push(setTimeout(() => setProgress(0), 1100));

    return () => {
      timeouts.current.forEach(clearTimeout);
    };
  }, [pathname]);

  return (
    <div
      className="fixed top-0 inset-x-0 z-[60] h-[2px] pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 220ms ease-out" }}
      aria-hidden="true"
    >
      <div
        className="h-full bg-primary"
        style={{
          width: `${progress}%`,
          transition: "width 480ms cubic-bezier(0.65, 0, 0.35, 1)",
          boxShadow: "0 0 8px hsl(var(--primary) / 0.55)",
        }}
      />
    </div>
  );
}
