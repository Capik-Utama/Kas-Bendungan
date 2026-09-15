"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

const colors = ["coral", "blue", "mint", "yellow", "lavender", "peach", "sky"];
const functionCards = [
  { kategori: "Pemasukan", ikon: "↗", catatan: "Daftar pemasukan kelompok" },
  { kategori: "Pengeluaran", ikon: "↘", catatan: "Daftar pengeluaran kelompok" },
  { kategori: "Anggota", ikon: "♙", catatan: "Daftar anggota kelompok" },
  { kategori: "Laporan", ikon: "▤", catatan: "Laporan kelompok" },
] as const;

type Fund = { id: number; name: string; note: string; icon: string; amount: number; parentId: number | null; category: string; allowMembers?: boolean };
let nextLocalId = 100000;

function shuffledColors() { return [...colors].sort(() => Math.random() - 0.5); }
function rupiah(value: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value); }

export default function DashboardPage() {
  const { canEdit } = useAuth();
  const [funds, setFunds] = useState<Fund[]>([]);
  const [cardColors, setCardColors] = useState(shuffledColors);
  const [notice, setNotice] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(isSupabaseConfigured);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [allowMembers, setAllowMembers] = useState(false);
  const total = useMemo(() => funds.reduce((sum, fund) => sum + fund.amount, 0), [funds]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const loadCards = async () => {
      setLoadingSummary(true);
      const [{ data, error }, iuranResult, pengeluaranResult] = await Promise.all([
        client.from("kartu_kas").select("id,parent_id,kategori,nama,catatan,nominal,ikon").order("urutan", { ascending: true }),
        client.from("iuran").select("kartu_id,nominal"),
        client.from("pengeluaran").select("kartu_id,nominal"),
      ]);
      if (error || iuranResult.error || pengeluaranResult.error) { setNotice("Database tersambung, tetapi saldo belum bisa dibaca"); setLoadingSummary(false); return; }
      const income = new Map<number, number>();
      const expense = new Map<number, number>();
      for (const row of iuranResult.data ?? []) if (row.kartu_id) income.set(Number(row.kartu_id), (income.get(Number(row.kartu_id)) ?? 0) + Number(row.nominal ?? 0));
      for (const row of pengeluaranResult.data ?? []) if (row.kartu_id) expense.set(Number(row.kartu_id), (expense.get(Number(row.kartu_id)) ?? 0) + Number(row.nominal ?? 0));
      const cards = (data ?? []).map((card) => ({ id: Number(card.id), name: card.nama, note: card.catatan, icon: card.ikon, amount: (income.get(Number(card.id)) ?? 0) - (expense.get(Number(card.id)) ?? 0), parentId: card.parent_id ? Number(card.parent_id) : null, category: card.kategori }));
      setFunds(cards.filter((card) => card.parentId === null));
      setLoadingSummary(false);
    };
    void loadCards();
    const channel = client.channel("kas-bendungan-summary").on("postgres_changes", { event: "*", schema: "public", table: "iuran" }, loadCards).on("postgres_changes", { event: "*", schema: "public", table: "pengeluaran" }, loadCards).subscribe();
    return () => { void client.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const refreshHome = () => setCardColors(shuffledColors());
    window.addEventListener("home-refresh", refreshHome);
    return () => window.removeEventListener("home-refresh", refreshHome);
  }, []);

  async function addFund(category = "Kelompok") {
    if (category !== "Kelompok") return;
    const name = window.prompt(`Nama ${category.toLowerCase()} baru`, `${category} Baru`);
    if (!name?.trim()) return;
    const draft: Fund = { id: nextLocalId++, name: name.trim(), amount: 0, note: "", icon: "+", parentId: null, category, allowMembers };
    if (supabase) {
      const { data, error } = await supabase.from("kartu_kas").insert({ parent_id: null, kategori: category, nama: draft.name, catatan: "", nominal: 0, ikon: "+", allow_tambah_anggota: allowMembers }).select("id").single();
      if (error) { setNotice("Kartu gagal disimpan ke database"); return; }
      draft.id = Number(data.id);
      const { error: functionError } = await supabase.from("kartu_kas").insert(functionCards.map((card) => ({ parent_id: draft.id, kategori: card.kategori, nama: card.kategori, catatan: card.catatan, nominal: 0, ikon: card.ikon, allow_tambah_anggota: false })));
      if (functionError) { setNotice("Kelompok tersimpan, tetapi kartu fungsi gagal dibuat"); return; }
    }
    setFunds((current) => [...current, draft]);
    setShowAddMenu(false);
    setAllowMembers(false);
    setNotice(`${category} berhasil ditambahkan`);
    window.setTimeout(() => setNotice(""), 1800);
  }

  return (
    <main className="dashboard-shell">
      <div className="grain" aria-hidden="true" />
      <section className="hero-row"><div className="balance-card"><div className="balance-top"><span>Total seluruh kas</span>{isSupabaseConfigured && <span className="status-dot">● Terhubung</span>}</div><strong>{loadingSummary ? "Memuat..." : rupiah(total)}</strong><div className="balance-bottom"><span>Terakhir diperbarui hari ini</span><span>↗</span></div></div></section>
      <section className="fund-grid" aria-label="Kantong kas bertingkat">
        {funds.map((fund, index) => <Link key={fund.id} href={`/kartu/${fund.id}`} className={`fund-card ${cardColors[index % cardColors.length]}`}><div className="fund-icon">{fund.icon}</div><div className="fund-content"><span className="fund-label">KAS {String(index + 1).padStart(2, "0")}</span><h4>{fund.name}</h4>{fund.note && <p>{fund.note}</p>}<div className="fund-amount">{rupiah(fund.amount)}</div></div><span className="card-arrow">Buka ↗</span></Link>)}
        {canEdit && <button className="add-card" onClick={() => setShowAddMenu((open) => !open)} aria-expanded={showAddMenu}><span className="plus">+</span><span><b>Tambah kartu</b><small>Buat tingkat pembukuan baru</small></span></button>}
      </section>
      {canEdit && showAddMenu && <section className="add-menu" aria-label="Tambah kartu kelompok"><div className="add-menu-heading"><div><span className="fund-label">PEMBUKUAN BERTINGKAT</span><h3>Tambah kartu kelompok</h3></div><button className="panel-close" onClick={() => setShowAddMenu(false)} aria-label="Tutup menu tambah">×</button></div><label className="card-setting"><input type="checkbox" checked={allowMembers} onChange={(event) => setAllowMembers(event.target.checked)} /> Izinkan penambahan anggota pada kartu ini</label><div className="add-options"><button onClick={() => void addFund("Kelompok")}><span>▦</span><b>Kelompok</b><small>Otomatis membuat kartu Pemasukan, Pengeluaran, Anggota, dan Laporan</small></button></div></section>}
      <div className="hierarchy-note"><b>Struktur fleksibel</b><span>Desa → RT/RW → kelompok → pembukuan</span></div>
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
