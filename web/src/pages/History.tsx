import { useEffect, useMemo, useState } from "react";
import Nav from "../components/Nav";
import { apiUrl } from "../utils/api";

interface Job {
  id: string;
  original_image_url: string;
  target_languages: string[];
  status: string;
  created_at: string;
  error: string | null;
  results: Record<string, string>;
}

export default function History() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  const storeHandle = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("handle") || params.get("shop") || "";
  }, []);

  const fetchHistory = () => {
    setLoading(true);
    fetch(apiUrl(`/api/translate/history?store_handle=${storeHandle}`))
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setJobs(data))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchHistory(); }, [storeHandle]);

  const handleRetry = async (jobId: string) => {
    setRetrying(jobId);
    try {
      const res = await fetch(apiUrl(`/api/translate/jobs/${jobId}/retry`), { method: "POST" });
      if (res.ok) {
        // Refresh after a short delay to let the job restart
        setTimeout(fetchHistory, 1000);
      }
    } catch { /* ignore */ }
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

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      done: "bg-green-100 text-green-700",
      failed: "bg-red-100 text-red-700",
      processing: "bg-blue-100 text-blue-700",
      pending: "bg-yellow-100 text-yellow-700",
    };
    return map[status] ?? "bg-gray-100 text-gray-600";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Translation History</h1>
            <p className="text-gray-500 text-sm">All your past translation jobs</p>
          </div>
          <button onClick={fetchHistory} className="text-sm text-indigo-600 font-medium hover:underline">Refresh</button>
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : jobs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
            <p className="text-gray-400 text-sm">No translations yet.</p>
            <a href="/translate" className="mt-3 inline-block text-indigo-600 text-sm font-medium hover:underline">Start your first translation →</a>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Image</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Languages</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <img src={job.original_image_url} alt="original" className="w-12 h-12 object-cover rounded border border-gray-100" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </td>
                    <td className="px-4 py-3 text-gray-700">{job.target_languages?.join(", ") || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(job.status)}`}>{job.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{job.created_at ? new Date(job.created_at).toLocaleString(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button onClick={() => setSelected(job)} className="text-indigo-600 hover:underline text-xs font-medium">View</button>
                      {job.status === "failed" && (
                        <button
                          onClick={() => handleRetry(job.id)}
                          disabled={retrying === job.id}
                          className="text-amber-600 hover:underline text-xs font-medium disabled:opacity-50"
                        >
                          {retrying === job.id ? "Retrying…" : "Retry"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Detail modal */}
        {selected && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelected(null)}>
            <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Job Details</h2>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg" aria-label="Close">✕</button>
              </div>
              <img src={selected.original_image_url} alt="original" className="w-full max-h-48 object-contain rounded border border-gray-100 mb-4" />
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(selected.status)}`}>{selected.status}</span>
                <span className="text-xs text-gray-400 font-mono">{selected.id}</span>
              </div>
              {selected.error && <p className="text-sm text-red-600 mb-3">{selected.error}</p>}
              {selected.results && Object.keys(selected.results).length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(selected.results).map(([lang, url]) => (
                    <div key={lang} className="border border-gray-100 rounded-lg overflow-hidden">
                      <img src={url} alt={lang} className="w-full object-cover" />
                      <div className="px-2 py-1.5 flex items-center justify-between bg-gray-50">
                        <span className="text-xs font-medium text-gray-600">{lang}</span>
                        <div className="flex gap-2">
                          <button onClick={() => downloadImage(url, lang)} className="text-xs text-indigo-600 hover:underline">Download</button>
                          <a href={url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">Open</a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No results available.</p>
              )}
              {selected.status === "failed" && (
                <button
                  onClick={() => { handleRetry(selected.id); setSelected(null); }}
                  className="mt-4 w-full bg-amber-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-amber-600"
                >
                  Retry This Job
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
