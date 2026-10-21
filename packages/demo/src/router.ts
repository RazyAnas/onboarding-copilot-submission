import { useEffect, useState } from "react";

/** Minimal hash router so we can exercise SPA navigation without a dependency. */
export function useHashRoute(): [string, (path: string) => void] {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || "/dashboard");

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.slice(1) || "/dashboard");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (path: string) => {
    window.location.hash = path;
  };

  return [route, navigate];
}
