import Client, { shared } from "@shoplinedev/appbridge";

const search = new URLSearchParams(location.search);

// AppBridge only works when embedded inside Shopline admin.
// Skip initialization when accessed directly (e.g. /privacy, /faq, or standalone browser).
let app: ReturnType<typeof Client.createApp> | null = null;

try {
  const host = shared.getHost();
  if (host) {
    app = Client.createApp({
      appKey: search.get("appkey") || import.meta.env.VITE_APP_KEY,
      host,
    });
  }
} catch {
  // Not embedded in Shopline — app stays null, pages render without AppBridge
}

export const useAppBridge = () => {
  return app;
};
