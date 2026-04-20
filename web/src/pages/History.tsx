import { useEffect, useState } from "react";
import Nav from "../components/Nav";

interface Job {
  id: string;
  original_image_url: string;
  target_languages: string[];
  status: string;
  created_at: string;
  results?: Record<string, string>;
}

export default function History() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

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
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Translation History</h1>
        <p className="text-gray-500 mb-8">All your past translation jobs</p>

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
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><img src={job.original_image_url} alt="original" className="w-12 h-12 object-cover rounded border border-gray-100" /></td>
                    <td className="px-4 py-3 text-gray-700">{job.target_languages.join(", ")}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(job.status)}`}>{job.status}</span></td>
                    <td className="px-4 py-3 text-gray-400">{new Date(job.created_at).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-4 py-3"><button onClick={() => setSelected(job)} className="text-indigo-600 hover:underline text-xs font-medium">View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selected && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelected(null)}>
            <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Job Details</h2>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <img src={selected.original_image_url} alt="original" className="w-full max-h-48 object-contain rounded border border-gray-100 mb-4" />
              <p className="text-xs text-gray-400 mb-3 font-mono">{selected.id}</p>
              {selected.results && Object.keys(selected.results).length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(selected.results).map(([lang, url]) => (
                    <div key={lang} className="border border-gray-100 rounded-lg overflow-hidden">
                      <img src={url} alt={lang} className="w-full object-cover" />
                      <div className="px-2 py-1.5 text-xs font-medium text-gray-600 bg-gray-50">{lang}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No results available.</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
