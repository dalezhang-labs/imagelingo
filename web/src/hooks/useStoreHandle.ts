import { useMemo } from "react";

export function useStoreHandle(): string {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const fromParams = params.get("handle") || params.get("shop") || "";
    if (fromParams) return fromParams;
    try {
      const host = window.location.hostname;
      const match = host.match(/^([^.]+)\.myshopline\.com$/);
      if (match) return match[1];
    } catch {}
    return "";
  }, []);
}
