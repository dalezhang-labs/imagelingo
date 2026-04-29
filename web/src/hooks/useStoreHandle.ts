import { useMemo } from "react";

/**
 * Extract the Shopline store handle from URL query params.
 * Shopline passes it as ?handle=xxx or ?shop=xxx when embedding the app.
 */
export function useStoreHandle(): string {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("handle") || params.get("shop") || "";
  }, []);
}
