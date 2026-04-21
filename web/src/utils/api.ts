/**
 * API base URL.
 * - In dev mode (shopline app dev): empty string → requests go to the local proxy
 * - In production (Vercel): points to the Railway backend URL
 */
export const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Build a full API URL.
 * e.g. apiUrl("/api/translate/") → "https://xxx.railway.app/api/translate/" (prod)
 *                                → "/api/translate/" (dev)
 */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
