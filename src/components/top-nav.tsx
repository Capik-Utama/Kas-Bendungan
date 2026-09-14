"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menus = [
  { href: "/", label: "Dashboard" },
  { href: "/warga", label: "Data Warga" },
  { href: "/iuran", label: "Pencatatan Iuran" },
  { href: "/pengeluaran", label: "Pencatatan Pengeluaran" },
  { href: "/riwayat", label: "Transparansi/Riwayat" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-6xl items-center gap-2 overflow-x-auto px-4 py-3 text-sm">
        {menus.map((menu) => {
          const active = pathname === menu.href;

          return (
            <Link
              key={menu.href}
              href={menu.href}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 transition ${
                active
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              {menu.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
