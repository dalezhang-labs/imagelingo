import { useAppBridge } from "./useAppBridge";

const search = new URLSearchParams(location.search);

export function useAuthenticatedFetch() {
  const app = useAppBridge();
  const isEmbedded = !!search.get("lang");

  return async (uri: string, options?: Record<string, any>) => {
    let token: string | undefined;
    if (isEmbedded && app) {
      try {
        const { shared } = await import("@shoplinedev/appbridge");
        token = await shared.getSessionToken(app);
      } catch {
        // AppBridge not available
      }
    }
    const { headers, ...restOptions } = options || {};
    const response = await fetch(uri, {
      headers: {
        ...headers,
        "X-Requested-With": "XMLHttpRequest",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...restOptions,
    });
    if (app) {
      checkHeadersForReauthorization(response.headers, app);
    }
    return response;
  };
}

async function checkHeadersForReauthorization(headers: Headers, app: any) {
  if (headers.get("X-SHOPLINE-API-Request-Failure-Reauthorize") === "1") {
    const authUrlHeader =
      headers.get("X-SHOPLINE-API-Request-Failure-Reauthorize-Url") || `/api/auth`;
    try {
      const { Redirect } = await import("@shoplinedev/appbridge");
      const redirect = Redirect.create(app);
      redirect.replaceTo(
        authUrlHeader.startsWith("/")
          ? `https://${window.location.host}${authUrlHeader}`
          : authUrlHeader
      );
    } catch {
      // Fallback: direct navigation
      window.location.href = authUrlHeader.startsWith("/")
        ? `https://${window.location.host}${authUrlHeader}`
        : authUrlHeader;
    }
  }
}
