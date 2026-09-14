"use client";

import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const starterFunds = [
  { id: 1, name: "Kematian", amount: 5000000, note: "Dana sosial warga", icon: "✦" },
  { id: 2, name: "Pemuda", amount: 15000000, note: "Kegiatan pemuda", icon: "⌁" },
  { id: 3, name: "Kampung", amount: 2000000, note: "Operasional kampung", icon: "⌂" },
  { id: 4, name: "Senam", amount: 3000000, note: "Kesehatan warga", icon: "↗" },
  { id: 5, name: "Umum", amount: 7000000, note: "Keperluan umum", icon: "◌" },
];

const colors = ["coral", "blue", "mint", "yellow", "lavender", "peach", "sky"];
function shuffledColors() {
  return [...colors].sort(() => Math.random() - 0.5);
}
function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

type Summary = { totalIuran: number; totalPengeluaran: number };

export default function DashboardPage() {
  const [funds, setFunds] = useState(starterFunds);
  const [cardColors, setCardColors] = useState(shuffledColors);
  const [notice, setNotice] = useState("");
  const [summary, setSummary] = useState<Summary>({ totalIuran: 0, totalPengeluaran: 0 });
  const [loadingSummary, setLoadingSummary] = useState(isSupabaseConfigured);
  const total = useMemo(() => funds.reduce((sum, fund) => sum + fund.amount, 0), [funds]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;
    const loadSummary = async () => {
      setLoadingSummary(true);
      const [iuranResult, pengeluaranResult] = await Promise.all([
        client.from("iuran").select("nominal"),
        client.from("pengeluaran").select("nominal"),
      ]);
      if (!active) return;
      if (iuranResult.error || pengeluaranResult.error) {
        setNotice("Database tersambung, tetapi data belum bisa dibaca");
      } else {
        setSummary({
          totalIuran: (iuranResult.data ?? []).reduce((sum, row) => sum + Number(row.nominal ?? 0), 0),
          totalPengeluaran: (pengeluaranResult.data ?? []).reduce((sum, row) => sum + Number(row.nominal ?? 0), 0),
        });
      }
      setLoadingSummary(false);
    };
    void loadSummary();
    const channel = client
      .channel("kas-bendungan-summary")
      .on("postgres_changes", { event: "*", schema: "public", table: "iuran" }, loadSummary)
      .on("postgres_changes", { event: "*", schema: "public", table: "pengeluaran" }, loadSummary)
      .subscribe();
    return () => { active = false; void client.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const refreshHome = () => {
      setCardColors(shuffledColors());
      setNotice("Warna kartu diperbarui");
      window.setTimeout(() => setNotice(""), 1800);
    };
    window.addEventListener("home-refresh", refreshHome);
    return () => window.removeEventListener("home-refresh", refreshHome);
  }, []);

  function shuffleCards() {
    setCardColors(shuffledColors());
    setNotice("Warna kartu diperbarui");
    window.setTimeout(() => setNotice(""), 1800);
  }

  function addFund() {
    const name = window.prompt("Nama kantong kas baru", "Kegiatan Baru");
    if (!name?.trim()) return;
    setFunds((current) => [...current, { id: Date.now(), name: name.trim(), amount: 0, note: "Kantong kas baru", icon: "+" }]);
    setNotice("Kantong kas berhasil ditambahkan");
    window.setTimeout(() => setNotice(""), 1800);
  }

  return (
    <main className="dashboard-shell">
      <div className="grain" aria-hidden="true" />
      <section className="hero-row">
        <div className="balance-card">
          <div className="balance-top"><span>Total seluruh kas</span>{isSupabaseConfigured && <span className="status-dot">● Terhubung</span>}</div>
          <strong>{loadingSummary ? "Memuat..." : rupiah(total)}</strong>
          <div className="balance-bottom"><span>Terakhir diperbarui hari ini</span><span>↗</span></div>
        </div>
      </section>

      <div className="section-heading">
        <div><span className="eyebrow">KANTONG KAS</span><h3>Kelola dana kampung</h3></div>
      </div>

      <section className="fund-grid" aria-label="Kantong kas kampung">
        {funds.map((fund, index) => (
          <button key={fund.id} className={`fund-card ${cardColors[index % cardColors.length]}`} onClick={() => { setNotice(`${fund.name}: ${rupiah(fund.amount)}`); window.setTimeout(() => setNotice(""), 2000); }}>
            <div className="fund-icon">{fund.icon}</div>
            <div className="fund-content"><span className="fund-label">KAS {String(index + 1).padStart(2, "0")}</span><h4>{fund.name}</h4><p>{fund.note}</p></div>
            <div className="fund-amount">{rupiah(fund.amount)}</div>
            <span className="card-arrow">↗</span>
          </button>
        ))}
        <button className="add-card" onClick={addFund}><span className="plus">+</span><span><b>Tambah kantong kas</b><small>Buat kategori baru</small></span></button>
      </section>

      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
