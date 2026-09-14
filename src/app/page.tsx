"use client";

import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const starterFunds = [
  { id: 1, name: "Kematian", amount: 5000000, note: "Dana sosial warga", icon: "✦" },
  { id: 2, name: "Pemuda", amount: 15000000, note: "Kegiatan pemuda", icon: "⌁" },
  { id: 3, name: "Kampung", amount: 2000000, note: "Operasional kampung", icon: "⌂" },
  { id: 4, name: "Umum", amount: 7000000, note: "Keperluan umum", icon: "◌" },
];

const colors = ["coral", "blue", "mint", "yellow", "lavender", "peach", "sky"];
const moduleCards = [
  ["Pemasukan", "Catat iuran dan dana masuk", "↗"],
  ["Pengeluaran", "Kelola belanja dan biaya", "↘"],
  ["Anggota", "Daftar warga atau anggota", "♙"],
  ["Laporan", "Lihat rekap pembukuan", "▤"],
] as const;
const addCategories = ["Kelompok", "Pemasukan", "Pengeluaran", "Anggota", "Laporan"] as const;

type Summary = { totalIuran: number; totalPengeluaran: number };
type OpenCard = { id: number; name: string; note: string; icon: string; amount: number; parentId: number | null; category: string };

function shuffledColors() {
  return [...colors].sort(() => Math.random() - 0.5);
}

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export default function DashboardPage() {
  const [funds, setFunds] = useState<OpenCard[]>(starterFunds.map((fund) => ({ ...fund, parentId: null, category: "Kelompok" })));
  const [childCards, setChildCards] = useState<OpenCard[]>([]);
  const [cardColors, setCardColors] = useState(shuffledColors);
  const [notice, setNotice] = useState("");
  const [summary, setSummary] = useState<Summary>({ totalIuran: 0, totalPengeluaran: 0 });
  const [loadingSummary, setLoadingSummary] = useState(isSupabaseConfigured);
  const [activeFund, setActiveFund] = useState<OpenCard | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
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
    if (!supabase) return;
    const client = supabase;
    const loadCards = async () => {
      const { data, error } = await client.from("kartu_kas").select("id,parent_id,kategori,nama,catatan,nominal,ikon").order("urutan", { ascending: true });
      if (error) { setNotice("Database tersambung, tetapi kartu belum bisa dibaca"); return; }
      const cards = (data ?? []).map((card) => ({ id: Number(card.id), name: card.nama, note: card.catatan, icon: card.ikon, amount: Number(card.nominal ?? 0), parentId: card.parent_id ? Number(card.parent_id) : null, category: card.kategori }));
      setFunds(cards.filter((card) => card.parentId === null));
      setChildCards(cards.filter((card) => card.parentId !== null));
    };
    void loadCards();
  }, []);

  useEffect(() => {
    const refreshHome = () => setCardColors(shuffledColors());
    window.addEventListener("home-refresh", refreshHome);
    return () => window.removeEventListener("home-refresh", refreshHome);
  }, []);

  async function addFund(category = "Kelompok") {
    const name = window.prompt(`Nama ${category.toLowerCase()} baru`, `${category} Baru`);
    if (!name?.trim()) return;
    const parentId = activeFund?.id ?? null;
    const draft: OpenCard = { id: 0, name: name.trim(), amount: 0, note: `${category} pembukuan baru`, icon: "+", parentId, category };
    if (supabase) {
      const { data, error } = await supabase.from("kartu_kas").insert({ parent_id: parentId, kategori: category, nama: draft.name, catatan: draft.note, nominal: 0, ikon: "+" }).select("id").single();
      if (error) { setNotice("Kartu gagal disimpan ke database"); return; }
      draft.id = Number(data.id);
    }
    if (parentId) setChildCards((current) => [...current, draft]);
    else setFunds((current) => [...current, draft]);
    setShowAddMenu(false);
    setNotice(`${category} berhasil ditambahkan`);
    window.setTimeout(() => setNotice(""), 1800);
  }

  function openFund(fund: OpenCard) {
    setActiveFund(fund);
    setShowAddMenu(false);
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

      <section className="fund-grid" aria-label="Kantong kas bertingkat">
        {funds.map((fund, index) => (
          <button key={fund.id} className={`fund-card ${cardColors[index % cardColors.length]}`} onClick={() => openFund(fund)}>
            <div className="fund-icon">{fund.icon}</div>
            <div className="fund-content"><span className="fund-label">KAS {String(index + 1).padStart(2, "0")}</span><h4>{fund.name}</h4><p>{fund.note}</p></div>
            <div className="fund-amount">{rupiah(fund.amount)}</div>
            <span className="card-arrow">↗</span>
          </button>
        ))}
        <button className="add-card" onClick={() => setShowAddMenu((open) => !open)} aria-expanded={showAddMenu}>
          <span className="plus">+</span>
          <span><b>Tambah kartu</b><small>Buat tingkat pembukuan baru</small></span>
        </button>
      </section>

      {activeFund && <section className="nested-panel" aria-label={`Isi kartu ${activeFund.name}`}>
        <div className="nested-heading"><div><span className="fund-label">KARTU TERPILIH</span><h3>{activeFund.name}</h3><p>Pilih modul pembukuan untuk kartu ini.</p></div><button className="panel-close" onClick={() => setActiveFund(null)} aria-label="Tutup kartu">×</button></div>
        <div className="module-grid">{moduleCards.map(([name, detail, icon]) => <button className="module-card" key={name} onClick={() => setNotice(`${name} untuk ${activeFund.name}`)}><span className="module-icon">{icon}</span><b>{name}</b><small>{detail}</small><span className="module-arrow">↗</span></button>)}</div>
        {childCards.filter((card) => card.parentId === activeFund.id).length > 0 && <div className="child-card-list"><span className="fund-label">KARTU DI DALAM {activeFund.name.toUpperCase()}</span>{childCards.filter((card) => card.parentId === activeFund.id).map((card) => <button key={card.id} onClick={() => openFund(card)}><span>{card.icon}</span><b>{card.name}</b><small>{card.category}</small><i>↗</i></button>)}</div>}
        <button className="nested-add" onClick={() => setShowAddMenu((open) => !open)} aria-expanded={showAddMenu}><span>＋</span><b>Tambah kartu di dalam {activeFund.name}</b><small>Kelompok, pemasukan, pengeluaran, anggota, atau laporan</small></button>
      </section>}

      {showAddMenu && <section className="add-menu" aria-label="Kategori kartu baru">
        <div className="add-menu-heading"><div><span className="fund-label">PEMBUKUAN BERTINGKAT</span><h3>Tambah kartu</h3></div><button className="panel-close" onClick={() => setShowAddMenu(false)} aria-label="Tutup menu tambah">×</button></div>
        <div className="add-options">{addCategories.map((category) => <button key={category} onClick={() => addFund(category)}><span>{category === "Kelompok" ? "▦" : category === "Pemasukan" ? "↗" : category === "Pengeluaran" ? "↘" : category === "Anggota" ? "♙" : "▤"}</span><b>{category}</b><small>Buat kartu {category.toLowerCase()}</small></button>)}</div>
      </section>}

      <div className="hierarchy-note"><b>Struktur fleksibel</b><span>Desa → RT/RW → kelompok → pembukuan</span></div>
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
