"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

const starterFunds = [
  { id: 1, name: "Kematian", amount: 5000000, note: "Dana sosial warga", icon: "✦" },
  { id: 2, name: "Pemuda", amount: 15000000, note: "Kegiatan pemuda", icon: "⌁" },
  { id: 3, name: "Kampung", amount: 2000000, note: "Operasional kampung", icon: "⌂" },
  { id: 4, name: "Umum", amount: 7000000, note: "Keperluan umum", icon: "◌" },
];

const colors = ["coral", "blue", "mint", "yellow", "lavender", "peach", "sky"];
const addCategories = ["Kelompok", "Pemasukan", "Pengeluaran", "Anggota", "Laporan"] as const;

type Fund = { id: number; name: string; note: string; icon: string; amount: number; parentId: number | null; category: string };
let nextLocalId = 100000;

function shuffledColors() { return [...colors].sort(() => Math.random() - 0.5); }
function rupiah(value: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value); }

export default function DashboardPage() {
  const { canEdit } = useAuth();
  const [funds, setFunds] = useState<Fund[]>(starterFunds.map((fund) => ({ ...fund, parentId: null, category: "Kelompok" })));
  const [cardColors, setCardColors] = useState(shuffledColors);
  const [notice, setNotice] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(isSupabaseConfigured);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const total = useMemo(() => funds.reduce((sum, fund) => sum + fund.amount, 0), [funds]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;
    const loadSummary = async () => {
      setLoadingSummary(true);
      const [iuranResult, pengeluaranResult] = await Promise.all([client.from("iuran").select("nominal"), client.from("pengeluaran").select("nominal")]);
      if (!active) return;
      if (iuranResult.error || pengeluaranResult.error) setNotice("Database tersambung, tetapi data belum bisa dibaca");
      else void iuranResult.data;
      setLoadingSummary(false);
    };
    void loadSummary();
    const channel = client.channel("kas-bendungan-summary").on("postgres_changes", { event: "*", schema: "public", table: "iuran" }, loadSummary).on("postgres_changes", { event: "*", schema: "public", table: "pengeluaran" }, loadSummary).subscribe();
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
    const draft: Fund = { id: nextLocalId++, name: name.trim(), amount: 0, note: `${category} pembukuan baru`, icon: "+", parentId: null, category };
    if (supabase) {
      const { data, error } = await supabase.from("kartu_kas").insert({ parent_id: null, kategori: category, nama: draft.name, catatan: draft.note, nominal: 0, ikon: "+" }).select("id").single();
      if (error) { setNotice("Kartu gagal disimpan ke database"); return; }
      draft.id = Number(data.id);
    }
    setFunds((current) => [...current, draft]);
    setShowAddMenu(false);
    setNotice(`${category} berhasil ditambahkan`);
    window.setTimeout(() => setNotice(""), 1800);
  }

  return (
    <main className="dashboard-shell">
      <div className="grain" aria-hidden="true" />
      <section className="hero-row"><div className="balance-card"><div className="balance-top"><span>Total seluruh kas</span>{isSupabaseConfigured && <span className="status-dot">● Terhubung</span>}</div><strong>{loadingSummary ? "Memuat..." : rupiah(total)}</strong><div className="balance-bottom"><span>Terakhir diperbarui hari ini</span><span>↗</span></div></div></section>
      <section className="fund-grid" aria-label="Kantong kas bertingkat">
        {funds.map((fund, index) => <Link key={fund.id} href={`/kartu/${fund.id}`} className={`fund-card ${cardColors[index % cardColors.length]}`}><div className="fund-icon">{fund.icon}</div><div className="fund-content"><span className="fund-label">KAS {String(index + 1).padStart(2, "0")}</span><h4>{fund.name}</h4><p>{fund.note}</p></div><div className="fund-amount">{rupiah(fund.amount)}</div><span className="card-arrow">Buka ↗</span></Link>)}
        {canEdit && <button className="add-card" onClick={() => setShowAddMenu((open) => !open)} aria-expanded={showAddMenu}><span className="plus">+</span><span><b>Tambah kartu</b><small>Buat tingkat pembukuan baru</small></span></button>}
      </section>
      {canEdit && showAddMenu && <section className="add-menu" aria-label="Kategori kartu baru"><div className="add-menu-heading"><div><span className="fund-label">PEMBUKUAN BERTINGKAT</span><h3>Tambah kartu</h3></div><button className="panel-close" onClick={() => setShowAddMenu(false)} aria-label="Tutup menu tambah">×</button></div><div className="add-options">{addCategories.map((category) => <button key={category} onClick={() => addFund(category)}><span>{category === "Kelompok" ? "▦" : category === "Pemasukan" ? "↗" : category === "Pengeluaran" ? "↘" : category === "Anggota" ? "♙" : "▤"}</span><b>{category}</b><small>Buat kartu {category.toLowerCase()}</small></button>)}</div></section>}
      <div className="hierarchy-note"><b>Struktur fleksibel</b><span>Desa → RT/RW → kelompok → pembukuan</span></div>
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
