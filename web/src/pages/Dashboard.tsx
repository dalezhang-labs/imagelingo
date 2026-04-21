import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import { apiUrl } from "../utils/api";

interface UsageData {
  used: number;
  limit: number;
  plan: string;
  month: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [usage, setUsage] = useState<UsageData>({ used: 0, limit: 5, plan: "free", month: "" });

  const storeHandle = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("handle") || params.get("shop") || "";
  }, []);

  useEffect(() => {
    fetch(apiUrl(`/api/imagelingo/translate/usage?store_handle=${storeHandle}`))
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setUsage(d))
      .catch(() => {});
  }, [storeHandle]);

  const pct = usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  const isOverLimit = usage.limit > 0 && usage.used >= usage.limit;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-500 mb-8">Overview of your ImageLingo usage</p>

        {isOverLimit && (
          <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            🚫 You've reached your monthly limit. <a href="#plans" className="font-semibold underline">Upgrade your plan</a> to continue translating.
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">Monthly Translations</span>
            <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium capitalize">{usage.plan}</span>
          </div>
          <div className="flex items-end gap-2 mb-3">
            <span className="text-3xl font-bold text-gray-900">{usage.used}</span>
            <span className="text-gray-400 mb-1">/ {usage.limit > 0 ? `${usage.limit} images` : "Unlimited"}</span>
          </div>
          {usage.limit > 0 && (
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className={`h-2 rounded-full transition-all ${pct >= 80 ? "bg-amber-500" : "bg-indigo-500"}`} style={{ width: `${pct}%` }} />
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2">
            {usage.limit > 0 ? `${Math.max(0, usage.limit - usage.used)} remaining this month` : "Unlimited usage"}
            {usage.month && ` (${usage.month})`}
          </p>
        </div>

        <div id="plans" className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-1">Upgrade your plan</h2>
          <p className="text-sm text-gray-500 mb-4">Get more translations and unlock advanced features.</p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { name: "Basic", price: "$9/mo", limit: "200 images" },
              { name: "Pro", price: "$29/mo", limit: "1,000 images" },
              { name: "Business", price: "$59/mo", limit: "Unlimited" },
            ].map((plan) => (
              <div key={plan.name} className={`border rounded-lg p-3 text-center cursor-pointer transition-colors ${usage.plan === plan.name.toLowerCase() ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-indigo-400"}`}>
                <div className="font-semibold text-gray-900 text-sm">{plan.name}</div>
                <div className="text-indigo-600 font-bold text-sm mt-0.5">{plan.price}</div>
                <div className="text-xs text-gray-400 mt-0.5">{plan.limit}</div>
              </div>
            ))}
          </div>
          <button className="w-full bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 transition-colors" onClick={() => alert("Payment integration coming soon")}>Upgrade Plan</button>
        </div>

        <button onClick={() => navigate("/translate")} className="w-full bg-white border border-indigo-300 text-indigo-600 rounded-xl py-4 font-medium hover:bg-indigo-50 transition-colors shadow-sm">＋ Start New Translation</button>
      </main>
    </div>
  );
}
