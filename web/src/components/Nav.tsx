import { Link, useLocation } from "react-router-dom";

const links = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/translate", label: "Translate" },
  { to: "/history", label: "History" },
];

export default function Nav() {
  const { pathname } = useLocation();
  return (
    <nav className="flex items-center gap-6 px-6 py-4 border-b border-gray-200 bg-white">
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
    </nav>
  );
}
