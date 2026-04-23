import { useStoreHandle } from "../hooks/useStoreHandle";

export default function StoreGuard({ children }: { children: React.ReactNode }) {
  const storeHandle = useStoreHandle();

  if (!storeHandle) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Store not connected</h2>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            ImageLingo needs to be accessed from your Shopline admin panel.
            Please install the app from the Shopline App Store and open it from your store dashboard.
          </p>
          <a
            href="https://appstore.shopline.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 text-white font-medium hover:bg-indigo-700 transition-colors text-sm"
          >
            Go to Shopline App Store
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
