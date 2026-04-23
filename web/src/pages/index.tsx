import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Nav from "../components/Nav";

interface UsageData {
  used: number;
  limit: number;
  plan: string;
}

const QUICK_STEPS = [
  "Paste a product image URL or use a file-hosted image link.",
  "Pick one or more target languages.",
  "Review the live preview and start the translation.",
];

const TARGET_LANGS = ["English", "German", "Japanese", "Korean", "French"];

export default function Index() {
  const navigate = useNavigate();
  const [usage] = useState<UsageData>({ used: 0, limit: 0, plan: "free" });

  const remaining = usage.limit > 0 ? usage.limit - usage.used : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <Nav />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] items-start mb-8">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-4">
              Quick start
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">Translate product images faster</h1>
            <p className="text-gray-600 text-base leading-6 mb-6 max-w-2xl">
              Turn a single image URL into localized assets with clear status updates, live previews, and immediate next steps.
            </p>

            <div className="flex flex-wrap gap-3 mb-6">
              <button
                onClick={() => navigate("/translate")}
                className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-white font-medium hover:bg-indigo-700 transition-colors shadow-sm"
              >
                Start translation
              </button>
              <Link
                to="/history"
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-5 py-3 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                View history
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {QUICK_STEPS.map((step, index) => (
                <div key={step} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold text-indigo-600 mb-2">Step {index + 1}</div>
                  <p className="text-sm text-gray-700 leading-5">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <aside className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Usage</h2>
              <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium capitalize">{usage.plan}</span>
            </div>
            <div className="flex items-end gap-2 mb-3">
              <span className="text-3xl font-bold text-gray-900">{usage.used}</span>
              <span className="text-gray-400 mb-1">/ 100 credits</span>
            </div>
            <p className="text-xs mt-2 text-gray-400">
              Each image costs 20 credits
            </p>

            <div className="mt-6 rounded-xl border border-gray-200 p-4 bg-gray-50">
              <h3 className="font-medium text-gray-900 mb-2">Popular languages</h3>
              <div className="flex flex-wrap gap-2">
                {TARGET_LANGS.map((lang) => (
                  <span key={lang} className="rounded-full bg-white border border-gray-200 px-3 py-1 text-xs text-gray-600">
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-2">Recommended next action</h2>
            <p className="text-sm text-gray-600 mb-4">
              Use the translate flow to preview a source image, choose languages, and track progress without losing context.
            </p>
            <button
              onClick={() => navigate("/translate")}
              className="w-full inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-white font-medium hover:bg-indigo-700 transition-colors"
            >
              Open translate flow
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-2">Free to use</h2>
            <p className="text-sm text-gray-600 mb-4">100 credits per month, each image costs 20 credits.</p>
            <button
              onClick={() => navigate("/dashboard")}
              className="w-full inline-flex items-center justify-center rounded-xl border border-indigo-300 px-4 py-3 text-indigo-600 font-medium hover:bg-indigo-50 transition-colors"
            >
              View usage dashboard
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
