"use client";

import { ReactNode, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const menuItems = [
  ["⌂", "Dashboard", "Ringkasan kas kampung", "/"],
  ["▣", "Catatan transaksi", "Pemasukan & pengeluaran", "/iuran"],
  ["♙", "Data warga", "Daftar warga kampung", "/warga"],
  ["◒", "Laporan", "Rekap transparansi kas", "/riwayat"],
  ["⚙", "Pengaturan", "Preferensi aplikasi", "#pengaturan"],
] as const;

export default function SiteChrome({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notice, setNotice] = useState("");

  function goHome() {
    router.push("/");
    setDrawerOpen(false);
  }

  function selectMenu(path: string) {
    if (path === "#pengaturan") {
      setNotice("Pengaturan siap dikembangkan");
      window.setTimeout(() => setNotice(""), 1800);
      return;
    }
    router.push(path);
    setDrawerOpen(false);
  }

  const activeMenu = pathname === "/" ? "Dashboard" : pathname === "/iuran" ? "Catatan transaksi" : pathname === "/warga" ? "Data warga" : pathname === "/riwayat" ? "Laporan" : "";

  return (
    <div className="site-chrome">
      <header className="app-header">
        <button className="village-logo" onClick={() => setDrawerOpen(true)} aria-label="Buka menu Kas Wangon Mas">
          <img src="/logo-pemuda-desa-wangon-mas.png" alt="Logo Pemuda Desa Wangon Mas" />
        </button>
        <button className="header-title header-home-button" onClick={goHome} aria-label="Kembali ke beranda">
          <h1>Kas Wangon Mas.<br />Desa Bendungan</h1>
          <p className="header-copy">Satu ruang sederhana untuk melihat, mengatur, dan menjaga kas warga bersama-sama.</p>
        </button>
      </header>
      <div className="site-content">{children}</div>
      {notice && <div className="toast">{notice}</div>}
      {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}
      <aside className={`drawer ${drawerOpen ? "open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="drawer-head"><div className="drawer-brand"><img className="sidebar-logo" src="/logo-pemuda-desa-wangon-mas.png" alt="Logo Pemuda Desa Wangon Mas" /><span>Kas<br /><b>Wangon Mas</b></span></div><button onClick={() => setDrawerOpen(false)} className="close-drawer" aria-label="Tutup menu">×</button></div>
        <nav className="drawer-nav">{menuItems.map(([icon, label, detail, path]) => <button key={label} className={activeMenu === label ? "selected" : ""} onClick={() => selectMenu(path)}><span className="nav-icon">{icon}</span><span><b>{label}</b><small>{detail}</small></span>{activeMenu === label && <i>•</i>}</button>)}</nav>
        <div className="drawer-tip"><span>✦</span><p><b>Ruang bersama</b><br />Catatan kas yang rapi membuat kampung makin berarti.</p></div>
        <div className="drawer-foot">©2026 Kas Desa - By Capik</div>
      </aside>
    </div>
  );
}
