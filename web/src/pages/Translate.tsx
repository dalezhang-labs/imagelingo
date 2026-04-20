import { useState, useRef } from "react";
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

export default function Translate() {
  const [imageUrl, setImageUrl] = useState("");
  const [selectedLangs, setSelectedLangs] = useState<string[]>(["EN-US"]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<JobResult | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleLang = (code: string) => {
    setSelectedLangs((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]
    );
  };

  const pollJob = (id: string) => {
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/translate/jobs/${id}`);
      if (!res.ok) return;
      const data: JobResult = await res.json();
      setJobResult(data);
      if (data.status === "done" || data.status === "failed") {
        clearInterval(pollRef.current!);
        setLoading(false);
      }
    }, 2000);
  };

  const handleTranslate = async () => {
    if (!imageUrl.trim() || selectedLangs.length === 0) return;
    setLoading(true);
    setJobResult(null);
    setJobId(null);

    try {
      const res = await fetch("/api/translate/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_handle: new URLSearchParams(window.location.search).get("shop") || "",
          product_id: "manual",
          image_url: imageUrl,
          target_languages: selectedLangs,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setJobResult({ status: "failed", results: {}, error: err.detail || "Request failed" });
        setLoading(false);
        return;
      }

      const { job_id } = await res.json();
      setJobId(job_id);
      setJobResult({ status: "pending", results: {}, error: null });
      pollJob(job_id);
    } catch (e: any) {
      setJobResult({ status: "failed", results: {}, error: e.message });
      setLoading(false);
    }
  };

  const statusColor: Record<JobStatus, string> = {
    idle: "text-gray-400",
    pending: "text-yellow-500",
    processing: "text-blue-500",
    done: "text-green-600",
    failed: "text-red-500",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Translate Image</h1>
        <p className="text-gray-500 mb-8">Paste an image URL and select target languages</p>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://example.com/product-image.jpg"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {imageUrl && (
            <img
              src={imageUrl}
              alt="preview"
              className="mt-3 max-h-48 rounded-lg object-contain border border-gray-100"
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
            />
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">Target Languages</label>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => toggleLang(lang.code)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  selectedLangs.includes(lang.code)
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleTranslate}
          disabled={loading || !imageUrl.trim() || selectedLangs.length === 0}
          className="w-full bg-indigo-600 text-white rounded-xl py-3 font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mb-6"
        >
          {loading ? "Translating…" : "Translate"}
        </button>

        {jobResult && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm font-medium text-gray-700">Status:</span>
              <span className={`text-sm font-semibold capitalize ${statusColor[jobResult.status]}`}>
                {jobResult.status}
              </span>
              {jobId && (
                <span className="text-xs text-gray-400 ml-auto font-mono">{jobId}</span>
              )}
            </div>

            {jobResult.error && (
              <p className="text-sm text-red-500 mb-3">{jobResult.error}</p>
            )}

            {jobResult.status === "done" && Object.keys(jobResult.results).length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">Results:</p>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(jobResult.results).map(([lang, url]) => (
                    <div key={lang} className="border border-gray-100 rounded-lg overflow-hidden">
                      <img src={url} alt={lang} className="w-full object-cover" />
                      <div className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-50">
                        {lang}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(jobResult.status === "pending" || jobResult.status === "processing") && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <svg className="animate-spin h-4 w-4 text-indigo-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Processing your image…
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
