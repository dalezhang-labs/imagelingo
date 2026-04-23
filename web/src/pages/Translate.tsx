import { useRef, useState, useCallback, useEffect } from "react";
import Nav from "../components/Nav";
import StoreGuard from "../components/StoreGuard";
import { useStoreHandle } from "../hooks/useStoreHandle";
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

export default function Translate() {
  const [imageUrl, setImageUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(["EN-US"]);
  const [job, setJob] = useState<JobResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const storeHandle = useStoreHandle();

  const isValidUrl = /^https?:\/\//i.test(imageUrl.trim());
  const canSubmit = isValidUrl && selectedLangs.length > 0 && !loading && !uploading;

  const toggleLang = (code: string) => {
    setSelectedLangs((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]
    );
  };

  // Handle file upload → standardize + upload to backend → get HTTPS URL
  const handleFiles = useCallback(async (files: FileList) => {
    const file = Array.from(files).find((f) => f.type.startsWith("image/"));
    if (!file) return;

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setUploading(true);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(apiUrl("/api/imagelingo/translate/upload"), {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const { url } = await res.json();
      setImageUrl(url);
      setPreviewUrl(url);
      URL.revokeObjectURL(localUrl);
    } catch {
      setPreviewUrl(localUrl); // keep local preview
    } finally {
      setUploading(false);
    }
  }, []);

  // When user pastes a URL, update preview
  useEffect(() => {
    if (isValidUrl) setPreviewUrl(imageUrl.trim());
  }, [imageUrl, isValidUrl]);

  const startTimer = () => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const pollJob = (jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const res = await fetch(apiUrl(`/api/imagelingo/translate/jobs/${jobId}`));
      if (!res.ok) return;
      const data = await res.json();
      setJob(data);
      if (data.status === "done" || data.status === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
        stopTimer();
        setLoading(false);
      }
    }, 2000);
  };

  const handleReauth = async () => {
    const params = storeHandle ? `?handle=${encodeURIComponent(storeHandle)}` : "";
    const res = await fetch(apiUrl(`/api/imagelingo/auth/reauth-url${params}`));
    if (res.ok) {
      const { auth_url } = await res.json();
      try { window.top!.location.href = auth_url; } catch { window.location.href = auth_url; }
    }
  };

  const handleTranslate = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setJob(null);
    setAuthExpired(false);
    startTimer();

    try {
      const res = await fetch(apiUrl("/api/imagelingo/translate/"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_handle: storeHandle,
          product_id: "manual",
          image_url: imageUrl.trim(),
          target_languages: selectedLangs,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 401) { setAuthExpired(true); setLoading(false); stopTimer(); return; }
        setJob({ job_id: "", status: "failed", original_image_url: "", results: {}, error: err.detail || `Error ${res.status}` });
        setLoading(false); stopTimer();
        return;
      }
      const { job_id } = await res.json();
      setJob({ job_id, status: "pending", original_image_url: imageUrl.trim(), results: {}, error: null });
      pollJob(job_id);
    } catch (e: any) {
      setJob({ job_id: "", status: "failed", original_image_url: "", results: {}, error: e?.message || "Unexpected error" });
      setLoading(false); stopTimer();
    }
  };

  const statusLabel: Record<string, { text: string; color: string }> = {
    pending: { text: "Queued", color: "text-yellow-600 bg-yellow-50" },
    processing: { text: "Translating…", color: "text-blue-600 bg-blue-50" },
    done: { text: "Complete", color: "text-green-600 bg-green-50" },
    failed: { text: "Failed", color: "text-red-600 bg-red-50" },
  };

  const hasResults = job?.status === "done" && Object.keys(job.results).length > 0;
  const [compareLang, setCompareLang] = useState<string | null>(null);
  const compareUrl = compareLang && job?.results[compareLang];

  // Auto-select first result language for comparison
  useEffect(() => {
    if (hasResults && !compareLang) {
      setCompareLang(Object.keys(job!.results)[0]);
    }
  }, [hasResults, compareLang, job]);

  return (
    <StoreGuard>
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="max-w-6xl mx-auto px-6 py-8">
        {authExpired && (
          <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-4 text-sm text-red-800">
            <p className="font-semibold mb-1">🔑 Store authorization expired</p>
            <p className="mb-3">Please re-authorize to continue.</p>
            <button onClick={handleReauth} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Re-authorize Store</button>
          </div>
        )}

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Translate Image</h1>
        <p className="text-gray-500 text-sm mb-6">Upload a product image and select target languages.</p>

        {/* Input section */}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px] mb-8">
          {/* Left: Image input + preview */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            {/* Drop zone / Preview */}
            <div
              className={`relative rounded-xl border-2 border-dashed overflow-hidden transition-colors cursor-pointer mb-4 ${
                dragOver ? "border-indigo-400 bg-indigo-50" : previewUrl ? "border-transparent" : "border-gray-300 bg-gray-50"
              }`}
              style={{ minHeight: previewUrl ? "auto" : "200px" }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => !previewUrl && fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Drop image here or click to browse"
            >
              {previewUrl ? (
                <div className="relative">
                  <img src={previewUrl} alt="Preview" className="w-full max-h-[400px] object-contain rounded-xl" />
                  {uploading && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-xl">
                      <div className="text-sm text-indigo-600 font-medium">Uploading…</div>
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setPreviewUrl(""); setImageUrl(""); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center text-sm hover:bg-black/70"
                    aria-label="Remove image"
                  >×</button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm text-gray-500 font-medium">Drag & drop an image here</p>
                  <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
            </div>

            {/* URL input */}
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Or paste image URL here…"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              {imageUrl && (
                <button onClick={() => { setImageUrl(""); setPreviewUrl(""); }} className="text-gray-400 hover:text-red-500 text-lg px-1" aria-label="Clear">×</button>
              )}
            </div>
          </div>

          {/* Right: Languages + Submit */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
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
            </div>

            <button
              onClick={handleTranslate}
              disabled={!canSubmit}
              className="w-full bg-indigo-600 text-white rounded-xl py-3.5 font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {loading ? `Translating… ${elapsed}s` : uploading ? "Uploading…" : `Translate to ${selectedLangs.length} language${selectedLangs.length !== 1 ? "s" : ""}`}
            </button>

            {loading && (
              <div className="text-center">
                <div className="inline-flex items-center gap-2 text-sm text-gray-500">
                  <svg className="animate-spin h-4 w-4 text-indigo-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  {job?.status === "pending" ? "Queued…" : "AI is translating your image…"}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Results section — side-by-side comparison */}
        {job && job.status !== "idle" && (
          <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900">Result</h2>
                {job.status && statusLabel[job.status] && (
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusLabel[job.status].color}`}>
                    {statusLabel[job.status].text}
                  </span>
                )}
                {loading && <span className="text-xs text-gray-400">{elapsed}s</span>}
              </div>
              {job.job_id && <span className="text-xs text-gray-300 font-mono">{job.job_id.slice(0, 8)}</span>}
            </div>

            {job.error && <p className="text-sm text-red-600 mb-4 bg-red-50 rounded-lg px-3 py-2">{job.error}</p>}

            {hasResults && (
              <>
                {/* Language tabs */}
                <div className="flex gap-2 mb-4 overflow-x-auto">
                  {Object.keys(job.results).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setCompareLang(lang)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors whitespace-nowrap ${
                        compareLang === lang
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-gray-600 border-gray-200 hover:border-indigo-400"
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>

                {/* Side-by-side comparison */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">Original</p>
                    <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                      <img src={previewUrl || imageUrl} alt="Original" className="w-full object-contain" style={{ maxHeight: "500px" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Translated ({compareLang})</p>
                      {compareUrl && (
                        <div className="flex gap-2">
                          <a href={compareUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">Open</a>
                          <button
                            onClick={async () => {
                              const r = await fetch(compareUrl!); const b = await r.blob();
                              const a = document.createElement("a"); a.href = URL.createObjectURL(b);
                              a.download = `imagelingo-${compareLang?.toLowerCase()}.png`; a.click();
                            }}
                            className="text-xs text-indigo-600 hover:underline"
                          >Download</button>
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                      {compareUrl ? (
                        <img src={compareUrl} alt={`Translated ${compareLang}`} className="w-full object-contain" style={{ maxHeight: "500px" }} />
                      ) : (
                        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Select a language above</div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Processing placeholder */}
            {(job.status === "pending" || job.status === "processing") && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">Original</p>
                  <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                    <img src={previewUrl || imageUrl} alt="Original" className="w-full object-contain" style={{ maxHeight: "500px" }} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">Translating…</p>
                  <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center" style={{ minHeight: "300px" }}>
                    <div className="text-center">
                      <svg className="animate-spin h-8 w-8 text-indigo-400 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <p className="text-sm text-gray-500">AI is working on it…</p>
                      <p className="text-xs text-gray-400 mt-1">{elapsed}s elapsed</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
    </StoreGuard>
  );
}
