import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import Nav from "../components/Nav";
import { apiUrl } from "../utils/api";

const LANGUAGES = [
  { code: "EN-US", label: "English (US)" },
  { code: "DE", label: "German" },
  { code: "JA", label: "Japanese" },
  { code: "KO", label: "Korean" },
  { code: "FR", label: "French" },
  { code: "ES", label: "Spanish" },
];

type JobStatus = "idle" | "pending" | "processing" | "done" | "failed";

interface JobResult {
  job_id: string;
  status: JobStatus;
  original_image_url: string;
  results: Record<string, string>;
  error: string | null;
}

interface UsageData {
  plan: string;
  limit: number;
  used: number;
}

export default function Translate() {
  const [imageUrls, setImageUrls] = useState<string[]>([""]);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(["EN-US"]);
  const [jobs, setJobs] = useState<JobResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const storeHandle = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("handle") || params.get("shop") || "";
  }, []);

  // Fetch usage on mount
  useEffect(() => {
    fetch(apiUrl(`/api/translate/usage?store_handle=${storeHandle}`))
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setUsage(d))
      .catch(() => {});
  }, [storeHandle]);

  const validUrls = imageUrls.filter((u) => /^https?:\/\//i.test(u.trim()));
  const canSubmit = validUrls.length > 0 && selectedLangs.length > 0 && !loading;

  const toggleLang = (code: string) => {
    setSelectedLangs((prev) => prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]);
  };

  const updateUrl = (idx: number, val: string) => {
    setImageUrls((prev) => { const n = [...prev]; n[idx] = val; return n; });
  };

  const removeUrl = (idx: number) => {
    setImageUrls((prev) => prev.length <= 1 ? [""] : prev.filter((_, i) => i !== idx));
  };

  const addUrlSlot = () => setImageUrls((prev) => [...prev, ""]);

  // Handle file drop / select → create object URLs (for preview) and upload placeholder
  const handleFiles = useCallback((files: FileList) => {
    const urls = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => URL.createObjectURL(f));
    if (urls.length) {
      setImageUrls((prev) => {
        const cleaned = prev.filter((u) => u.trim());
        return [...cleaned, ...urls];
      });
    }
  }, []);

  const pollJobs = (jobIds: string[]) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const results = await Promise.all(
        jobIds.map((id) => fetch(apiUrl(`/api/translate/jobs/${id}`)).then((r) => r.ok ? r.json() : null))
      );
      const updated = results.filter(Boolean) as JobResult[];
      setJobs(updated);
      if (updated.every((j) => j.status === "done" || j.status === "failed")) {
        if (pollRef.current) clearInterval(pollRef.current);
        setLoading(false);
      }
    }, 2500);
  };

  const handleTranslate = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setJobs([]);
    try {
      const isBatch = validUrls.length > 1;
      if (isBatch) {
        const res = await fetch(apiUrl("/api/translate/batch"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store_handle: storeHandle,
            product_id: "manual",
            image_urls: validUrls.map((u) => u.trim()),
            target_languages: selectedLangs,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setJobs([{ job_id: "", status: "failed", original_image_url: "", results: {}, error: err.detail || `Error ${res.status}` }]);
          setLoading(false);
          return;
        }
        const { job_ids } = await res.json();
        setJobs(job_ids.map((id: string) => ({ job_id: id, status: "pending", original_image_url: "", results: {}, error: null })));
        pollJobs(job_ids);
      } else {
        const res = await fetch(apiUrl("/api/translate/"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store_handle: storeHandle,
            product_id: "manual",
            image_url: validUrls[0].trim(),
            target_languages: selectedLangs,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setJobs([{ job_id: "", status: "failed", original_image_url: "", results: {}, error: err.detail || `Error ${res.status}` }]);
          setLoading(false);
          return;
        }
        const { job_id } = await res.json();
        setJobs([{ job_id, status: "pending", original_image_url: "", results: {}, error: null }]);
        pollJobs([job_id]);
      }
    } catch (e: any) {
      setJobs([{ job_id: "", status: "failed", original_image_url: "", results: {}, error: e?.message || "Unexpected error" }]);
      setLoading(false);
    }
  };

  const statusColor: Record<string, string> = {
    pending: "text-yellow-600", processing: "text-blue-600", done: "text-green-600", failed: "text-red-600",
  };

  const quotaNearLimit = usage && usage.limit > 0 && usage.used >= usage.limit * 0.8;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <Nav />
      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Usage warning banner */}
        {quotaNearLimit && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            ⚠️ You've used <strong>{usage!.used}</strong> of <strong>{usage!.limit}</strong> images this month ({usage!.plan} plan).
            {usage!.used >= usage!.limit
              ? <> Quota exceeded — <a href="/dashboard" className="font-semibold underline">upgrade your plan</a>.</>
              : <> Running low — consider <a href="/dashboard" className="font-semibold underline">upgrading</a>.</>}
          </div>
        )}

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Translate Images</h1>
        <p className="text-gray-600 mb-8">Upload one or more product images and select target languages.</p>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Left: Image inputs */}
          <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 mb-3">Image URLs</label>

            {/* Drop zone */}
            <div
              className={`rounded-xl border-2 border-dashed p-6 text-center mb-4 transition-colors cursor-pointer ${dragOver ? "border-indigo-400 bg-indigo-50" : "border-gray-300 bg-gray-50"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Drop images here or click to browse"
            >
              <p className="text-sm text-gray-500">Drag & drop images here, or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">Or paste image URLs below</p>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
            </div>

            {imageUrls.map((url, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-2">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => updateUrl(idx, e.target.value)}
                  placeholder="https://example.com/product-image.jpg"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
                <button onClick={() => removeUrl(idx)} className="text-gray-400 hover:text-red-500 text-lg" aria-label="Remove">×</button>
              </div>
            ))}
            <button onClick={addUrlSlot} className="text-sm text-indigo-600 font-medium hover:underline mt-1">+ Add another URL</button>

            {/* Preview thumbnails */}
            {validUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {validUrls.map((url, i) => (
                  <img key={i} src={url} alt={`preview ${i}`} className="w-16 h-16 object-cover rounded border border-gray-200" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ))}
              </div>
            )}
          </section>

          {/* Right: Languages + Submit */}
          <aside className="space-y-6">
            <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <label className="block text-sm font-medium text-gray-700 mb-3">Target Languages</label>
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
              <button
                onClick={handleTranslate}
                disabled={!canSubmit}
                className="w-full bg-indigo-600 text-white rounded-xl py-3 font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Translating…" : `Translate ${validUrls.length} image${validUrls.length !== 1 ? "s" : ""}`}
              </button>
              <p className="text-xs text-gray-400 mt-2 text-center">
                {validUrls.length} image{validUrls.length !== 1 ? "s" : ""} × {selectedLangs.length} language{selectedLangs.length !== 1 ? "s" : ""}
              </p>
            </section>
          </aside>
        </div>

        {/* Job results */}
        {jobs.length > 0 && (
          <section className="mt-8 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Translation Jobs</h2>
            {jobs.map((job) => (
              <div key={job.job_id || Math.random()} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <span className={`text-sm font-semibold capitalize ${statusColor[job.status] || "text-gray-500"}`}>{job.status}</span>
                  {job.job_id && <span className="text-xs text-gray-400 font-mono">{job.job_id.slice(0, 8)}…</span>}
                  {(job.status === "pending" || job.status === "processing") && (
                    <svg className="animate-spin h-4 w-4 text-indigo-500" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  )}
                </div>
                {job.error && <p className="text-sm text-red-600 mb-2">{job.error}</p>}
                {job.status === "done" && Object.keys(job.results).length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Object.entries(job.results).map(([lang, url]) => (
                      <div key={lang} className="border border-gray-100 rounded-lg overflow-hidden">
                        <img src={url} alt={lang} className="w-full object-cover" />
                        <div className="px-2 py-1.5 flex items-center justify-between bg-gray-50">
                          <span className="text-xs font-medium text-gray-600">{lang}</span>
                          <a href={url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">Open</a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
