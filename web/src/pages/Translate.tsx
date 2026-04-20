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

const isLikelyUrl = (value: string) => /^https?:\/\//i.test(value.trim());

export default function Translate() {
  const [imageUrl, setImageUrl] = useState("");
  const [selectedLangs, setSelectedLangs] = useState<string[]>(["EN-US"]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<JobResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageInputFocused, setImageInputFocused] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
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

  const imageUrlTrimmed = imageUrl.trim();
  const imageUrlValid = !imageUrlTrimmed || isLikelyUrl(imageUrlTrimmed);
  const inputError = !imageUrlTrimmed
    ? "Paste a direct image URL to continue."
    : !imageUrlValid
      ? "The URL should start with http:// or https://."
      : null;
  const canSubmit = Boolean(imageUrlValid && imageUrlTrimmed && selectedLangs.length > 0 && storeHandle && !loading);

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
    if (!canSubmit) return;
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
          image_url: imageUrlTrimmed,
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

  const resetForm = () => {
    setImageUrl("");
    setJobResult(null);
    setJobId(null);
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedUrl(text);
    window.setTimeout(() => setCopiedUrl((current) => (current === text ? null : current)), 1200);
  };

  const downloadResult = async (url: string, lang: string) => {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `imagelingo-${lang.toLowerCase()}.png`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  };

  const shareResult = async (url: string) => {
    if (navigator.share) {
      await navigator.share({ title: "ImageLingo translation", url });
      return;
    }
    await copyText(url);
  };

  const statusColor: Record<JobStatus, string> = {
    idle: "text-gray-400",
    pending: "text-yellow-600",
    processing: "text-blue-600",
    done: "text-green-600",
    failed: "text-red-600",
  };

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

            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Image URL</label>
              <span className={`text-xs font-medium ${imageUrlTrimmed && imageUrlValid ? "text-green-600" : "text-gray-400"}`}>
                {imageUrlTrimmed && imageUrlValid ? "Looks valid" : "Paste a direct link"}
              </span>
            </div>
            <div className={`rounded-2xl border px-3 py-2 transition-shadow ${imageInputFocused ? "border-indigo-400 ring-2 ring-indigo-100" : imageUrlTrimmed && !imageUrlValid ? "border-red-300 bg-red-50" : "border-gray-300"}`}>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                onFocus={() => setImageInputFocused(true)}
                onBlur={() => setImageInputFocused(false)}
                placeholder="https://example.com/product-image.jpg"
                aria-invalid={Boolean(imageUrlTrimmed && !imageUrlValid)}
                className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <p>Tip: use a direct image link for the best preview and processing reliability.</p>
              <button type="button" className="text-indigo-600 font-medium hover:underline" onClick={() => void navigator.clipboard.readText().then((text) => text && setImageUrl(text.trim()))}>
                Paste from clipboard
              </button>
              <button type="button" className="text-gray-600 font-medium hover:underline disabled:opacity-40" onClick={resetForm} disabled={!imageUrlTrimmed && !jobResult}>
                Clear
              </button>
            </div>
            {inputError && <p className="mt-2 text-xs text-red-600">{inputError}</p>}

            {imageUrlTrimmed && (
              <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                <img
                  src={imageUrlTrimmed}
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
                    className={`px-3 py-2 rounded-full text-sm font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
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
                className="w-full bg-indigo-600 text-white rounded-xl py-3 font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
              >
                {loading ? "Translating…" : "Translate"}
              </button>

              <div className="mt-4 text-xs text-gray-500 leading-5 space-y-1">
                <div>Image URL: {imageUrlTrimmed ? (imageUrlValid ? "provided" : "invalid") : "required"}</div>
                <div>Languages: {selectedLangs.join(", ") || "none"}</div>
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
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-sm font-medium text-gray-700">Results</p>
                  <p className="text-xs text-gray-500">Tap an action to open, copy, download, or share a result.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(jobResult.results).map(([lang, url]) => (
                    <div key={lang} className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                      <img src={url} alt={lang} className="w-full object-cover" />
                      <div className="px-3 py-3 bg-white border-t border-gray-200 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{lang}</p>
                            <p className="text-xs text-gray-500 truncate">{url}</p>
                          </div>
                          <a href={url} target="_blank" rel="noreferrer" className="text-xs font-medium text-indigo-600 hover:underline">
                            Open
                          </a>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <button type="button" onClick={() => void copyText(url)} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-gray-700 hover:border-indigo-400 hover:text-indigo-600">
                            {copiedUrl === url ? "Copied" : "Copy"}
                          </button>
                          <button type="button" onClick={() => void downloadResult(url, lang)} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-gray-700 hover:border-indigo-400 hover:text-indigo-600">
                            Download
                          </button>
                          <button type="button" onClick={() => void shareResult(url)} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-gray-700 hover:border-indigo-400 hover:text-indigo-600">
                            Share
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {jobResult.status === "failed" && (
              <div className="text-sm text-gray-600">
                <p className="font-medium text-gray-900 mb-1">Try again with a direct image URL and a store handle in the embedded context.</p>
                <p>If the image is hosted behind auth or blocks hotlinking, preview and translation may fail.</p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
