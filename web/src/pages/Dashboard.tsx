import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import { apiUrl } from "../utils/api";

interface UsageData {
  credits_used: number;
  credits_limit: number;
  credits_per_image: number;
  plan: string;
  month: string;
}

const DEFAULT_USAGE: UsageData = {
  credits_used: 0,
  credits_limit: 100,
  credits_per_image: 20,
  plan: "free",
  month: "",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [usage, setUsage] = useState<UsageData>(DEFAULT_USAGE);

  const storeHandle = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("handle") || params.get("shop") || "";
  }, []);

  useEffect(() => {
    fetch(apiUrl(`/api/imagelingo/translate/usage?store_handle=${storeHandle}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setUsage(d))
      .catch(() => {});
  }, [storeHandle]);

  const remaining = Math.max(0, usage.credits_limit - usage.credits_used);
  const imagesRemaining = Math.floor(remaining / usage.credits_per_image);
  const pct =
    usage.credits_limit > 0
      ? Math.min(100, Math.round((usage.credits_used / usage.credits_limit) * 100))
      : 0;
  const isLow = pct >= 80;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-500 mb-8">Overview of your ImageLingo usage</p>

        {remaining <= 0 && usage.credits_limit > 0 && (
          <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            🚫 You've used all your credits this month. Credits reset at the start of next month.
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">Monthly Credits</span>
            <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium capitalize">
              {usage.plan}
            </span>
          </div>
          <div className="flex items-end gap-2 mb-3">
            <span className="text-3xl font-bold text-gray-900">{usage.credits_used}</span>
            <span className="text-gray-400 mb-1">/ {usage.credits_limit} credits</span>
          </div>
          {usage.credits_limit > 0 && (
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${isLow ? "bg-amber-500" : "bg-indigo-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2">
            {remaining} credits remaining (~{imagesRemaining} images)
            {usage.month && ` · ${usage.month}`}
          </p>
          <p className="text-xs text-gray-300 mt-1">
            Each image translation costs {usage.credits_per_image} credits
          </p>
        </div>

        <button
          onClick={() => navigate("/translate")}
          className="w-full bg-white border border-indigo-300 text-indigo-600 rounded-xl py-4 font-medium hover:bg-indigo-50 transition-colors shadow-sm"
        >
          ＋ Start New Translation
        </button>
      </main>
    </div>
  );
}
