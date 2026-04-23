import Client, { shared } from "@shoplinedev/appbridge";

const search = new URLSearchParams(location.search);

// AppBridge only works when embedded inside Shopline admin (host param present).
// Skip initialization when accessed directly (e.g. /privacy, /faq, or standalone browser).
const host = shared.getHost();
const isEmbedded = !!host;

const app = isEmbedded
  ? Client.createApp({
      appKey: search.get("appkey") || import.meta.env.VITE_APP_KEY,
      host,
    })
  : null;

export const useAppBridge = () => {
  return app;
};
