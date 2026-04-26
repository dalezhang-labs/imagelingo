import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Nav from "../components/Nav";
import StoreGuard from "../components/StoreGuard";
import { useStoreHandle } from "../hooks/useStoreHandle";
import { apiUrl } from "../utils/api";
import { withCurrentSearch } from "../utils/navigation";

interface Job {
  id: string;
  original_image_url: string;
  target_languages: string[];
  status: string;
  created_at: string;
  error: string | null;
  results: Record<string, string>;
}

type StatusFilter = "all" | "active" | "done" | "failed";

const FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All jobs" },
  { key: "active", label: "In progress" },
  { key: "done", label: "Completed" },
  { key: "failed", label: "Failed" },
];

function formatJobDate(value: string) {
  if (!value) return "Unknown time";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusMeta(status: string) {
  const map: Record<string, { label: string; classes: string }> = {
    done: { label: "Complete", classes: "bg-emerald-100 text-emerald-700" },
    failed: { label: "Failed", classes: "bg-red-100 text-red-700" },
    processing: { label: "Translating", classes: "bg-blue-100 text-blue-700" },
    pending: { label: "Queued", classes: "bg-amber-100 text-amber-700" },
  };

  return map[status] ?? { label: status || "Unknown", classes: "bg-gray-100 text-gray-600" };
}

function getJobSummary(job: Job) {
  const resultCount = Object.keys(job.results || {}).length;

  if (job.status === "done") {
    return `${resultCount} localized image${resultCount === 1 ? "" : "s"} ready to review or download.`;
  }

  if (job.status === "failed") {
    return job.error || "This run did not finish. Open the job for details and retry when ready.";
  }

  if (job.status === "processing") {
    return "Translation is in progress. Open the job to monitor the outputs as they arrive.";
  }

  if (job.status === "pending") {
    return "The job is queued and waiting for processing.";
  }

  return "This job is waiting for an updated status.";
}

export default function History() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const storeHandle = useStoreHandle();
  const translatePath = withCurrentSearch("/translate");

  const fetchHistory = () => {
    setLoading(true);
    fetch(apiUrl(`/api/imagelingo/translate/history?store_handle=${storeHandle}`))
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => setJobs(data))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchHistory();
  }, [storeHandle]);

  const handleRetry = async (jobId: string) => {
    setRetrying(jobId);
    try {
      const response = await fetch(apiUrl(`/api/imagelingo/translate/jobs/${jobId}/retry`), {
        method: "POST",
      });
      if (response.ok) {
        setTimeout(fetchHistory, 1000);
      }
    } catch {
      // ignore
    }
    setRetrying(null);
  };

  const downloadImage = async (url: string, lang: string) => {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `imagelingo-${lang.toLowerCase()}.png`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  };

  const activeJobs = jobs.filter((job) => job.status === "pending" || job.status === "processing").length;
  const completedJobs = jobs.filter((job) => job.status === "done").length;
  const failedJobs = jobs.filter((job) => job.status === "failed").length;

  const filteredJobs = useMemo(() => {
    if (statusFilter === "all") return jobs;
    if (statusFilter === "active") {
      return jobs.filter((job) => job.status === "pending" || job.status === "processing");
    }
    return jobs.filter((job) => job.status === statusFilter);
  }, [jobs, statusFilter]);

  return (
    <StoreGuard>
      <div className="min-h-screen bg-gray-50">
        <Nav />
        <main className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex flex-col gap-4 mb-8 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Translation History</h1>
              <p className="text-gray-500">
                Track recent jobs, reopen finished assets, and retry failed runs without losing context.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to={translatePath}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                New translation
              </Link>
              <button
                type="button"
                onClick={fetchHistory}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:border-gray-300 hover:text-gray-900"
              >
                Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="h-4 w-24 rounded bg-gray-100 mb-3" />
                  <div className="h-8 w-16 rounded bg-gray-100 mb-2" />
                  <div className="h-3 w-32 rounded bg-gray-100" />
                </div>
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 7h16M7 4h10M7 10h10m-8 4h6m-9 6h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No translations yet</h2>
              <p className="text-sm text-gray-500 max-w-md mx-auto mb-6 leading-6">
                Your finished runs, retries, and in-progress jobs will all land here. Start one translation to turn this page into a reusable task queue.
              </p>
              <Link
                to={translatePath}
                className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Start your first translation
              </Link>
            </div>
          ) : (
            <>
              <section className="grid gap-3 mb-6 sm:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <p className="text-sm text-gray-500 mb-2">All jobs</p>
                  <p className="text-3xl font-bold text-gray-900">{jobs.length}</p>
                  <p className="text-sm text-gray-400 mt-2">Every translation run in this store.</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <p className="text-sm text-gray-500 mb-2">In progress</p>
                  <p className="text-3xl font-bold text-gray-900">{activeJobs}</p>
                  <p className="text-sm text-gray-400 mt-2">Queued or currently generating assets.</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <p className="text-sm text-gray-500 mb-2">Needs attention</p>
                  <p className="text-3xl font-bold text-gray-900">{failedJobs}</p>
                  <p className="text-sm text-gray-400 mt-2">
                    {completedJobs} completed job{completedJobs === 1 ? "" : "s"} available to reopen.
                  </p>
                </div>
              </section>

              <div className="flex flex-wrap gap-2 mb-6">
                {FILTERS.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setStatusFilter(filter.key)}
                    className={`rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
                      statusFilter === filter.key
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-700"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              {filteredJobs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
                  No jobs match the current filter yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredJobs.map((job) => {
                    const status = getStatusMeta(job.status);
                    return (
                      <article
                        key={job.id}
                        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-gray-300"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <button
                            type="button"
                            onClick={() => setSelected(job)}
                            className="flex flex-1 items-start gap-4 text-left"
                          >
                            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
                              <img
                                src={job.original_image_url}
                                alt="Original"
                                className="h-full w-full object-cover"
                                onError={(event) => {
                                  (event.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.classes}`}>
                                  {status.label}
                                </span>
                                <span className="text-xs text-gray-400">{formatJobDate(job.created_at)}</span>
                                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-mono text-gray-500">
                                  {job.id.slice(0, 8)}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-gray-900">
                                {job.target_languages?.length || 0} target language
                                {job.target_languages?.length === 1 ? "" : "s"}
                              </p>
                              <p className="text-sm text-gray-500 mt-1 leading-6">{getJobSummary(job)}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {job.target_languages?.length ? (
                                  job.target_languages.map((lang) => (
                                    <span
                                      key={lang}
                                      className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600"
                                    >
                                      {lang}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-gray-400">No languages recorded</span>
                                )}
                              </div>
                            </div>
                          </button>
                          <div className="flex items-center gap-2 md:pl-4">
                            <button
                              type="button"
                              onClick={() => setSelected(job)}
                              className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-indigo-200 hover:text-indigo-700"
                            >
                              View details
                            </button>
                            {job.status === "failed" && (
                              <button
                                type="button"
                                onClick={() => handleRetry(job.id)}
                                disabled={retrying === job.id}
                                className="rounded-full border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                              >
                                {retrying === job.id ? "Retrying..." : "Retry"}
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {selected && (
            <div
              className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
              onClick={() => setSelected(null)}
            >
              <div
                className="bg-white rounded-2xl p-6 max-w-3xl w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-gray-900">Job Details</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {formatJobDate(selected.created_at)} · {selected.id}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="text-gray-400 hover:text-gray-600 text-lg"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                <img
                  src={selected.original_image_url}
                  alt="Original"
                  className="w-full max-h-52 object-contain rounded-2xl border border-gray-100 mb-4 bg-gray-50"
                />

                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusMeta(selected.status).classes}`}>
                    {getStatusMeta(selected.status).label}
                  </span>
                  {selected.target_languages?.map((lang) => (
                    <span key={lang} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                      {lang}
                    </span>
                  ))}
                </div>

                {selected.error && (
                  <p className="text-sm text-red-600 mb-4 rounded-xl bg-red-50 px-4 py-3">{selected.error}</p>
                )}

                {selected.results && Object.keys(selected.results).length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Object.entries(selected.results).map(([lang, url]) => (
                      <div key={lang} className="border border-gray-100 rounded-2xl overflow-hidden bg-white">
                        <img src={url} alt={lang} className="w-full h-48 object-cover bg-gray-50" />
                        <div className="px-3 py-2.5 flex items-center justify-between bg-gray-50">
                          <span className="text-xs font-medium text-gray-600">{lang}</span>
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => downloadImage(url, lang)}
                              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                            >
                              Download
                            </button>
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                            >
                              Open
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No result images are available for this job yet.</p>
                )}

                {selected.status === "failed" && (
                  <button
                    type="button"
                    onClick={() => {
                      handleRetry(selected.id);
                      setSelected(null);
                    }}
                    className="mt-4 w-full rounded-xl bg-amber-500 text-white py-3 text-sm font-medium hover:bg-amber-600"
                  >
                    Retry This Job
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </StoreGuard>
  );
}
