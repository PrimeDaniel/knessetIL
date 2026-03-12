import { useEffect, useState } from "react";

/**
 * Debounces a value by the given delay (default 300ms).
 * Used by SearchInput to avoid firing API queries on every keystroke.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
