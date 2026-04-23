import { useMemo } from "react";

// Store handle is extracted once from URL params on first page load,
// then cached so it survives client-side navigation (which strips query strings).
let _cachedHandle = "";

export function useStoreHandle(): string {
  return useMemo(() => {
    if (_cachedHandle) return _cachedHandle;

    const params = new URLSearchParams(window.location.search);
    const fromParams = params.get("handle") || params.get("shop") || "";
    if (fromParams) {
      _cachedHandle = fromParams;
      return fromParams;
    }
    try {
      const host = window.location.hostname;
      const match = host.match(/^([^.]+)\.myshopline\.com$/);
      if (match) {
        _cachedHandle = match[1];
        return match[1];
      }
    } catch {}
    return "";
  }, []);
}
