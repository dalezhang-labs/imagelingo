import { Link, useLocation } from "react-router-dom";
import { useMemo } from "react";

const links = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/translate", label: "Translate" },
  { to: "/history", label: "History" },
];

export default function Nav() {
  const { pathname } = useLocation();

  const storeHandle = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("handle") || params.get("shop") || "";
  }, []);

  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
      <div className="flex items-center gap-6">
        <span className="font-bold text-indigo-600 text-lg mr-4">ImageLingo</span>
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={`text-sm font-medium ${
              pathname.startsWith(l.to)
                ? "text-indigo-600"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>
      {storeHandle && (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-600">
            {storeHandle.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm text-gray-600">{storeHandle}</span>
        </div>
      )}
    </nav>
  );
}
