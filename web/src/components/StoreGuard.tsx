import { type ReactNode } from "react";
import { useStoreHandle } from "../hooks/useStoreHandle";
import { apiUrl } from "../utils/api";

interface StoreGuardProps {
  children: ReactNode;
}

/**
 * Wraps pages that require a valid Shopline store context.
 * If no store handle is found in the URL, shows a friendly message.
 * The actual auth check (token validity) is handled by the backend returning 401.
 */
export default function StoreGuard({ children }: StoreGuardProps) {
  const storeHandle = useStoreHandle();

  // If no handle at all, show install prompt
  if (!storeHandle) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 shadow-sm text-center">
          <div className="text-4xl mb-4">🔗</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Open from Shopline Admin</h1>
          <p className="text-gray-600 text-sm mb-6">
            ImageLingo needs to be opened from your Shopline store admin panel to work correctly.
          </p>
          <a
            href={apiUrl("/api/imagelingo/auth/install")}
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-white font-medium hover:bg-indigo-700 transition-colors"
          >
            Go to Install
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
