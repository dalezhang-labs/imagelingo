import { useMemo, useRef, useState } from "react";
import Nav from "../components/Nav";

const LANGUAGES = [
  { code: "EN-US", label: "English (US)" },
  { code: "DE", label: "German" },
  { code: "JA", label: "Japanese" },
  { code: "KO", label: "Korean" },
  { code: "FR", label: "French" },
];

type JobStatus = "idle" | "pending" | "processing" | "done" | "failed";

interface JobResult {
  status: JobStatus;
  results: Record<string, string>;
  error: string | null;
}

const steps = ["1. Add an image URL", "2. Pick languages", "3. Review status and results"];

export default function Translate() {
  const [imageUrl, setImageUrl] = useState("");
  const [selectedLangs, setSelectedLangs] = useState<string[]>(["EN-US"]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<JobResult | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const storeHandle = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get("handle") ||
      params.get("shop") ||
      new URLSearchParams(new URL(document.referrer || window.location.href).search).get("handle") ||
      ""
    );
  }, []);

  const toggleLang = (code: string) => {
    setSelectedLangs((prev) => (prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]));
  };

  const pollJob = (id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/translate/jobs/${id}`);
      if (!res.ok) return;
      const data: JobResult = await res.json();
      setJobResult(data);
      if (data.status === "done" || data.status === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
        setLoading(false);
      }
    }, 2000);
  };

  const handleTranslate = async () => {
    if (!imageUrl.trim() || selectedLangs.length === 0 || !storeHandle) return;
    setLoading(true);
    setJobResult(null);
    setJobId(null);
    try {
      const res = await fetch("/api/translate/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_handle: storeHandle,
          product_id: "manual",
          image_url: imageUrl,
          target_languages: selectedLangs,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setJobResult({ status: "failed", results: {}, error: err.detail || "Request failed" });
        setLoading(false);
        return;
      }
      const { job_id } = await res.json();
      setJobId(job_id);
      setJobResult({ status: "pending", results: {}, error: null });
      pollJob(job_id);
    } catch (e: any) {
      setJobResult({ status: "failed", results: {}, error: e?.message || "Unexpected error" });
      setLoading(false);
    }
  };

  const statusColor: Record<JobStatus, string> = {
    idle: "text-gray-400",
    pending: "text-yellow-600",
    processing: "text-blue-600",
    done: "text-green-600",
    failed: "text-red-600",
  };

  const canSubmit = Boolean(imageUrl.trim() && selectedLangs.length > 0 && storeHandle && !loading);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <Nav />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Translate Image</h1>
          <p className="text-gray-600">A streamlined flow with live preview, explicit status, and clear next steps.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-3 mb-6">
              {steps.map((step) => (
                <div key={step} className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700">
                  {step}
                </div>
              ))}
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-2">Image URL</label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/product-image.jpg"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <p className="text-xs text-gray-500 mt-2">Tip: use a direct image link for the best preview and processing reliability.</p>

            {imageUrl && (
              <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                <img
                  src={imageUrl}
                  alt="preview"
                  className="w-full max-h-72 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">Target Languages</label>
                <span className="text-xs text-gray-500">{selectedLangs.length} selected</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => toggleLang(lang.code)}
                    aria-pressed={selectedLangs.includes(lang.code)}
                    className={`px-3 py-2 rounded-full text-sm font-medium border transition-colors ${
                      selectedLangs.includes(lang.code)
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900">Ready to translate</h2>
                <span className={`text-xs font-medium ${storeHandle ? "text-green-600" : "text-amber-600"}`}>
                  {storeHandle ? "Store detected" : "Missing store context"}
                </span>
              </div>

              {!storeHandle && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                  The app needs a store handle from the embedded context or URL before translation can start.
                </p>
              )}

              <button
                onClick={handleTranslate}
                disabled={!canSubmit}
                className="w-full bg-indigo-600 text-white rounded-xl py-3 font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Translating…" : "Translate"}
              </button>

              <div className="mt-4 text-xs text-gray-500 leading-5">
                <div>Image URL: {imageUrl.trim() ? "provided" : "required"}</div>
                <div>Languages: {selectedLangs.join(", ")}</div>
                <div>Context: {storeHandle ? "available" : "not available"}</div>
              </div>
            </section>
          </aside>
        </div>

        {jobResult && (
          <section className="mt-6 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-sm font-medium text-gray-700">Status:</span>
              <span className={`text-sm font-semibold capitalize ${statusColor[jobResult.status]}`}>{jobResult.status}</span>
              {jobId && <span className="text-xs text-gray-400 ml-auto font-mono">{jobId}</span>}
            </div>

            {jobResult.error && <p className="text-sm text-red-600 mb-3">{jobResult.error}</p>}

            {(jobResult.status === "pending" || jobResult.status === "processing") && (
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                <svg className="animate-spin h-4 w-4 text-indigo-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Processing your image…
              </div>
            )}

            {jobResult.status === "done" && Object.keys(jobResult.results).length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">Results</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(jobResult.results).map(([lang, url]) => (
                    <div key={lang} className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                      <img src={url} alt={lang} className="w-full object-cover" />
                      <div className="px-3 py-2 text-xs font-medium text-gray-600 bg-white border-t border-gray-200">{lang}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
