/**
 * Preserve current URL search params when navigating between pages.
 * Shopline embeds the app with params like ?appkey=...&lang=...&handle=...
 * These must be carried through all internal navigation.
 */
export function withCurrentSearch(path: string): string {
  const search = window.location.search;
  if (!search) return path;
  return `${path}${search}`;
}

/**
 * Extract store handle from URL params.
 * Shopline passes it as ?handle=xxx or ?shop=xxx
 */
export function getStoreHandle(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("handle") || params.get("shop") || "";
}
