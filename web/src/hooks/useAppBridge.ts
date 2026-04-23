// Lazy AppBridge initialization.
// @shoplinedev/appbridge has side effects that crash outside Shopline admin.
// We never import it at the module top level.

let _app: any = null;
let _initPromise: Promise<any> | null = null;

async function loadAppBridge(): Promise<any> {
  const search = new URLSearchParams(location.search);
  const isEmbedded = !!search.get("appkey") || !!search.get("lang");
  if (!isEmbedded) return null;

  try {
    const { default: Client, shared } = await import("@shoplinedev/appbridge");
    const host = shared.getHost();
    if (host) {
      _app = Client.createApp({
        appKey: search.get("appkey") || import.meta.env.VITE_APP_KEY,
        host,
      });
    }
  } catch {
    // Not embedded or AppBridge unavailable
  }
  return _app;
}

export function getAppBridgePromise() {
  if (!_initPromise) _initPromise = loadAppBridge();
  return _initPromise;
}

export const useAppBridge = () => _app;
