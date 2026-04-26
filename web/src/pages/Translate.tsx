import { useCallback, useEffect, useRef, useState } from "react";
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

const CREDITS_PER_IMAGE = 20;
const ALL_LANGUAGE_CODES = LANGUAGES.map((lang) => lang.code);

type JobStatus = "idle" | "pending" | "processing" | "done" | "failed";

interface JobResult {
  job_id: string;
  status: JobStatus;
  original_image_url: string;
  results: Record<string, string>;
  error: string | null;
}

async function downloadImageAsset(url: string, lang: string) {
  const response = await fetch(url);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `imagelingo-${lang.toLowerCase()}.png`;
  link.click();
  URL.revokeObjectURL(objectUrl);
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
  const [compareLang, setCompareLang] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const storeHandle = useStoreHandle();

  const isValidUrl = /^https?:\/\//i.test(imageUrl.trim());
  const sourceReady = Boolean(previewUrl) && isValidUrl;
  const hasUploadPreviewOnly = Boolean(previewUrl) && !isValidUrl;
  const canSubmit = sourceReady && selectedLangs.length > 0 && !loading && !uploading;
  const selectedLanguageDetails = LANGUAGES.filter((lang) => selectedLangs.includes(lang.code));
  const resultsCount = job ? Object.keys(job.results).length : 0;
  const hasResults = job?.status === "done" && resultsCount > 0;
  const compareUrl = compareLang ? job?.results[compareLang] : null;

  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    stopTimer();
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((current) => current + 1), 1000);
  };

  const resetImage = () => {
    setImageUrl("");
    setPreviewUrl("");
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const toggleLang = (code: string) => {
    setSelectedLangs((prev) =>
      prev.includes(code) ? prev.filter((lang) => lang !== code) : [...prev, code]
    );
  };

  const handleFiles = useCallback(async (files: FileList) => {
    const file = Array.from(files).find((candidate) => candidate.type.startsWith("image/"));
    if (!file) return;

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
      setPreviewUrl(localUrl);
      setImageUrl("");
    } finally {
      setUploading(false);
    }
  }, []);

  useEffect(() => {
    if (isValidUrl) {
      setPreviewUrl(imageUrl.trim());
    }
  }, [imageUrl, isValidUrl]);

  useEffect(() => {
    return () => {
      clearPoll();
      stopTimer();
    };
  }, []);

  useEffect(() => {
    if (hasResults) {
      const [firstResult] = Object.keys(job.results);
      if (!compareLang || !job.results[compareLang]) {
        setCompareLang(firstResult);
      }
    }
  }, [compareLang, hasResults, job]);

  const pollJob = (jobId: string) => {
    clearPoll();
    pollRef.current = setInterval(async () => {
      const res = await fetch(apiUrl(`/api/imagelingo/translate/jobs/${jobId}`));
      if (!res.ok) return;

      const data = await res.json();
      setJob(data);

      if (data.status === "done" || data.status === "failed") {
        clearPoll();
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
      try {
        window.top!.location.href = auth_url;
      } catch {
        window.location.href = auth_url;
      }
    }
  };

  const handleTranslate = async () => {
    if (!canSubmit) return;

    clearPoll();
    setLoading(true);
    setJob(null);
    setAuthExpired(false);
    setCompareLang(null);
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
        if (res.status === 401) {
          setAuthExpired(true);
          setLoading(false);
          stopTimer();
          return;
        }

        setJob({
          job_id: "",
          status: "failed",
          original_image_url: "",
          results: {},
          error: err.detail || `Error ${res.status}`,
        });
        setLoading(false);
        stopTimer();
        return;
      }

      const { job_id } = await res.json();
      setJob({
        job_id,
        status: "pending",
        original_image_url: imageUrl.trim(),
        results: {},
        error: null,
      });
      pollJob(job_id);
    } catch (error: any) {
      setJob({
        job_id: "",
        status: "failed",
        original_image_url: "",
        results: {},
        error: error?.message || "Unexpected error",
      });
      setLoading(false);
      stopTimer();
    }
  };

  const downloadAllResults = async () => {
    if (!job) return;

    for (const [lang, url] of Object.entries(job.results)) {
      await downloadImageAsset(url, lang);
    }
  };

  const statusLabel: Record<JobStatus, { text: string; color: string }> = {
    idle: { text: "Not started", color: "text-gray-600 bg-gray-100" },
    pending: { text: "Queued", color: "text-amber-700 bg-amber-50" },
    processing: { text: "Translating", color: "text-blue-700 bg-blue-50" },
    done: { text: "Complete", color: "text-emerald-700 bg-emerald-50" },
    failed: { text: "Failed", color: "text-red-700 bg-red-50" },
  };

  const stepCards = [
    {
      step: "01",
      title: "Source image",
      detail: sourceReady
        ? "Preview locked in and ready."
        : hasUploadPreviewOnly
          ? "Upload still needs a hosted URL."
          : "Drop a file or paste a public image URL.",
      active: !sourceReady,
      complete: sourceReady,
    },
    {
      step: "02",
      title: "Target languages",
      detail:
        selectedLanguageDetails.length > 0
          ? `${selectedLanguageDetails.length} language${selectedLanguageDetails.length === 1 ? "" : "s"} selected.`
          : "Pick at least one language.",
      active: sourceReady && selectedLanguageDetails.length === 0,
      complete: selectedLanguageDetails.length > 0,
    },
    {
      step: "03",
      title: "Run translation",
      detail: loading
        ? job?.status === "pending"
          ? "Queued and waiting for processing."
          : "Generating localized image variants."
        : hasResults
          ? `${resultsCount} translated image${resultsCount === 1 ? "" : "s"} ready.`
          : canSubmit
            ? "Everything is ready to go."
            : "Complete the setup to unlock the run button.",
      active: canSubmit || loading,
      complete: hasResults,
    },
  ];

  const submitHint = loading
    ? "Stay on this page. Results will appear below as soon as the job finishes."
    : uploading
      ? "Uploading the image first. The translation button will unlock when the hosted URL is ready."
      : hasUploadPreviewOnly
        ? "The local preview is visible, but the uploaded URL is not ready yet. Try uploading again or paste a hosted image URL."
        : !imageUrl.trim()
          ? "Add an image URL or upload a file to begin."
          : !isValidUrl
            ? "Use a public http(s) image URL so ImageLingo can fetch it."
            : selectedLangs.length === 0
              ? "Choose at least one target language."
              : `Ready to generate ${selectedLangs.length} localized image${selectedLangs.length === 1 ? "" : "s"}.`;

  return (
    <StoreGuard>
      <div className="min-h-screen bg-gray-50">
        <Nav />
        <main className="max-w-6xl mx-auto px-6 py-8">
          {authExpired && (
            <div className="mb-6 rounded-2xl border border-red-300 bg-red-50 px-4 py-4 text-sm text-red-800">
              <p className="font-semibold mb-1">Store authorization expired</p>
              <p className="mb-3">Please re-authorize the Shopline store before starting a new translation.</p>
              <button
                onClick={handleReauth}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Re-authorize Store
              </button>
            </div>
          )}

          <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Translate Image</h1>
              <p className="text-gray-500 max-w-2xl">
                Move through the setup once, then keep the result view and progress status in the same place while the job runs.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-white border border-gray-200 px-3 py-1.5 text-gray-600">
                1 source image
              </span>
              <span className="rounded-full bg-white border border-gray-200 px-3 py-1.5 text-gray-600">
                {selectedLangs.length} language{selectedLangs.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full bg-white border border-gray-200 px-3 py-1.5 text-gray-600">
                {loading ? `${elapsed}s elapsed` : `${CREDITS_PER_IMAGE} credits per image`}
              </span>
            </div>
          </div>

          <section className="grid gap-3 mb-8 md:grid-cols-3">
            {stepCards.map((card) => (
              <div
                key={card.step}
                className={`rounded-2xl border p-4 shadow-sm transition-colors ${
                  card.complete
                    ? "border-emerald-200 bg-emerald-50/70"
                    : card.active
                      ? "border-indigo-200 bg-indigo-50/70"
                      : "border-gray-200 bg-white"
                }`}
              >
                <p className="text-xs font-semibold tracking-[0.18em] text-gray-400 uppercase mb-2">{card.step}</p>
                <h2 className="font-semibold text-gray-900 mb-1">{card.title}</h2>
                <p className="text-sm text-gray-600 leading-6">{card.detail}</p>
              </div>
            ))}
          </section>

          <div className="grid gap-6 mb-8 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
            <div className="space-y-6">
              <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.18em] text-indigo-600 uppercase mb-2">Step 1</p>
                    <h2 className="text-lg font-semibold text-gray-900">Choose your source image</h2>
                    <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                      Public image URLs work best. You can also drag in a file and let ImageLingo upload it before translating.
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                      sourceReady
                        ? "bg-emerald-50 text-emerald-700"
                        : hasUploadPreviewOnly
                          ? "bg-amber-50 text-amber-700"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {sourceReady ? "Preview ready" : hasUploadPreviewOnly ? "Upload pending" : "Waiting for image"}
                  </span>
                </div>

                <div
                  className={`relative rounded-2xl border-2 border-dashed overflow-hidden transition-colors ${
                    dragOver
                      ? "border-indigo-400 bg-indigo-50"
                      : previewUrl
                        ? "border-transparent bg-gray-50"
                        : "border-gray-300 bg-gray-50"
                  }`}
                  style={{ minHeight: previewUrl ? "auto" : "280px" }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(false);
                    handleFiles(event.dataTransfer.files);
                  }}
                  onClick={() => {
                    if (!previewUrl) openFilePicker();
                  }}
                  onKeyDown={(event) => {
                    if (!previewUrl && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      openFilePicker();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="Drop image here or click to browse"
                >
                  {previewUrl ? (
                    <div className="relative">
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="w-full max-h-[440px] object-contain rounded-2xl bg-gray-50"
                      />
                      <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openFilePicker();
                          }}
                          className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-white"
                        >
                          Change image
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            resetImage();
                          }}
                          className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white hover:bg-black/70"
                        >
                          Remove
                        </button>
                      </div>
                      {uploading && (
                        <div className="absolute inset-0 bg-white/75 flex items-center justify-center rounded-2xl">
                          <div className="rounded-full bg-white px-4 py-2 text-sm font-medium text-indigo-600 shadow-sm">
                            Uploading image...
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                      <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <p className="text-base font-medium text-gray-700">Drag an image here or browse from your computer</p>
                      <p className="text-sm text-gray-400 mt-2">ImageLingo will preview it immediately and use the hosted URL for translation.</p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => event.target.files && handleFiles(event.target.files)}
                  />
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                    placeholder="Or paste image URL here..."
                    className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={resetImage}
                      className="rounded-xl border border-gray-200 px-3 py-3 text-sm text-gray-500 hover:text-red-500 hover:border-red-200"
                      aria-label="Clear"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span>Best results come from public image links that load without authentication.</span>
                    <button
                      type="button"
                      onClick={openFilePicker}
                      className="text-indigo-600 font-medium hover:text-indigo-700"
                    >
                      Browse files
                    </button>
                  </div>
                </div>
              </section>

              {job && job.status !== "idle" && (
                <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex flex-col gap-3 mb-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-lg font-semibold text-gray-900">Results</h2>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusLabel[job.status].color}`}>
                          {statusLabel[job.status].text}
                        </span>
                        {loading && <span className="text-xs text-gray-400">{elapsed}s</span>}
                      </div>
                      <p className="text-sm text-gray-500">
                        {hasResults
                          ? `${resultsCount} localized image${resultsCount === 1 ? "" : "s"} ready for review or download.`
                          : job.status === "failed"
                            ? "The run did not complete. Review the error and retry when ready."
                            : "Keep this page open while the translation job finishes."}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasResults && (
                        <button
                          type="button"
                          onClick={downloadAllResults}
                          className="rounded-full border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                        >
                          Download all
                        </button>
                      )}
                      {job.job_id && (
                        <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-mono text-gray-500">
                          {job.job_id.slice(0, 8)}
                        </span>
                      )}
                    </div>
                  </div>

                  {job.error && (
                    <p className="text-sm text-red-600 mb-4 bg-red-50 rounded-xl px-4 py-3">{job.error}</p>
                  )}

                  {hasResults && (
                    <>
                      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                        {Object.keys(job.results).map((lang) => (
                          <button
                            key={lang}
                            type="button"
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

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                          <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">Original</p>
                          <div className="rounded-2xl border border-gray-200 overflow-hidden bg-gray-50">
                            <img
                              src={previewUrl || imageUrl}
                              alt="Original"
                              className="w-full max-h-[500px] object-contain"
                            />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-2 gap-3">
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                              Translated ({compareLang})
                            </p>
                            {compareUrl && (
                              <div className="flex items-center gap-3 text-xs font-medium">
                                <a
                                  href={compareUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-indigo-600 hover:text-indigo-700"
                                >
                                  Open
                                </a>
                                <button
                                  type="button"
                                  onClick={() => downloadImageAsset(compareUrl, compareLang || "result")}
                                  className="text-indigo-600 hover:text-indigo-700"
                                >
                                  Download
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="rounded-2xl border border-gray-200 overflow-hidden bg-gray-50">
                            {compareUrl ? (
                              <img
                                src={compareUrl}
                                alt={`Translated ${compareLang}`}
                                className="w-full max-h-[500px] object-contain"
                              />
                            ) : (
                              <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                                Select a language above
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {(job.status === "pending" || job.status === "processing") && (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">Original</p>
                        <div className="rounded-2xl border border-gray-200 overflow-hidden bg-gray-50">
                          <img
                            src={previewUrl || imageUrl}
                            alt="Original"
                            className="w-full max-h-[500px] object-contain"
                          />
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">Progress</p>
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 flex items-center justify-center min-h-[320px] px-6">
                          <div className="text-center max-w-sm">
                            <svg className="animate-spin h-8 w-8 text-indigo-400 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            <p className="text-sm font-medium text-gray-700 mb-1">
                              {job.status === "pending" ? "Queued and waiting to start" : "AI is translating the image"}
                            </p>
                            <p className="text-sm text-gray-500">
                              ImageLingo will keep this panel updated as the job moves from queueing to finished assets.
                            </p>
                            <p className="text-xs text-gray-400 mt-3">{elapsed}s elapsed</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>

            <aside className="space-y-4 lg:sticky lg:top-6">
              <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.18em] text-indigo-600 uppercase mb-2">Step 2</p>
                    <h2 className="text-lg font-semibold text-gray-900">Pick target languages</h2>
                  </div>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                    {selectedLangs.length} selected
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
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

                <div className="flex items-center gap-2 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setSelectedLangs(ALL_LANGUAGE_CODES)}
                    className="rounded-full border border-gray-200 px-3 py-1.5 text-gray-600 hover:border-indigo-200 hover:text-indigo-700"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLangs([])}
                    disabled={selectedLangs.length === 0}
                    className="rounded-full border border-gray-200 px-3 py-1.5 text-gray-600 hover:border-red-200 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Clear
                  </button>
                </div>
              </section>

              <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <p className="text-xs font-semibold tracking-[0.18em] text-indigo-600 uppercase mb-2">Step 3</p>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Run translation</h2>

                <div className="rounded-2xl border border-gray-200 divide-y divide-gray-100 mb-4">
                  <div className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-gray-500">Source image</span>
                    <span className={`font-medium ${sourceReady ? "text-gray-900" : "text-gray-400"}`}>
                      {sourceReady ? "Ready" : "Missing"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-gray-500">Outputs</span>
                    <span className="font-medium text-gray-900">
                      {selectedLangs.length} variant{selectedLangs.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-gray-500">Estimated usage</span>
                    <span className="font-medium text-gray-900">{CREDITS_PER_IMAGE} credits</span>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs text-gray-500 mb-2">Languages in this run</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedLanguageDetails.length > 0 ? (
                        selectedLanguageDetails.map((lang) => (
                          <span
                            key={lang.code}
                            className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
                          >
                            {lang.label}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">No languages selected yet.</span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleTranslate}
                  disabled={!canSubmit}
                  className="w-full bg-indigo-600 text-white rounded-xl py-3.5 font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {loading
                    ? `Translating... ${elapsed}s`
                    : uploading
                      ? "Uploading..."
                      : `Translate to ${selectedLangs.length} language${selectedLangs.length === 1 ? "" : "s"}`}
                </button>

                <p
                  className={`mt-3 text-sm leading-6 ${
                    hasUploadPreviewOnly ? "text-amber-700" : loading ? "text-indigo-700" : "text-gray-500"
                  }`}
                >
                  {submitHint}
                </p>

                {(loading || hasResults || job?.status === "failed") && (
                  <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-sm font-medium text-gray-700">Current job</span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusLabel[job?.status || "idle"].color}`}>
                        {statusLabel[job?.status || "idle"].text}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {loading
                        ? "The translation panel below will fill in automatically when the job finishes."
                        : hasResults
                          ? "Review the output below, switch languages, or download every variant at once."
                          : "Fix the issue shown in the result panel, then run the translation again."}
                    </p>
                  </div>
                )}
              </section>
            </aside>
          </div>
        </main>
      </div>
    </StoreGuard>
  );
}
