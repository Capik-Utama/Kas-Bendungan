"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { calculateGroupBalances } from "@/lib/group-balances";
import { GroupLogoUpload } from "@/components/group-logo-upload";
import { removeGroupLogo, uploadGroupLogo } from "@/lib/group-logo";

const colors = ["coral", "blue", "mint", "yellow", "lavender", "peach", "sky"];
const functionCards = [
  { kategori: "Pemasukan", ikon: "↗", catatan: "Daftar pemasukan kelompok" },
  { kategori: "Pengeluaran", ikon: "↘", catatan: "Daftar pengeluaran kelompok" },
  { kategori: "Anggota", ikon: "♙", catatan: "Daftar anggota kelompok" },
  { kategori: "Laporan", ikon: "▤", catatan: "Laporan kelompok" },
] as const;

type Fund = { id: number; name: string; note: string; icon: string; amount: number; parentId: number | null; category: string; allowMembers?: boolean; logoUrl?: string | null };
let nextLocalId = 100000;

function shuffledColors() { return [...colors].sort(() => Math.random() - 0.5); }
function rupiah(value: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value); }

export default function DashboardPage() {
  const { canEdit, profile } = useAuth();
  const [funds, setFunds] = useState<Fund[]>([]);
  const [summaryTotal, setSummaryTotal] = useState(0);
  const [cardColors, setCardColors] = useState(shuffledColors);
  const [notice, setNotice] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(isSupabaseConfigured);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [allowMembers, setAllowMembers] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupLogo, setGroupLogo] = useState<File | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const loadCards = async () => {
      setLoadingSummary(true);
      const [{ data, error }, iuranResult, pengeluaranResult, groupsResult] = await Promise.all([
        client.from("kartu_kas").select("id,parent_id,kategori,nama,catatan,nominal,ikon,logo_url").order("urutan", { ascending: true }),
        client.from("iuran").select("kartu_id,nominal"),
        client.from("pengeluaran").select("kartu_id,nominal,jenis_keperluan,tujuan_kelompok_id"),
        client.from("kelompok").select("id,nama"),
      ]);
      if (error || iuranResult.error || pengeluaranResult.error || groupsResult.error) { setNotice("Database tersambung, tetapi saldo belum bisa dibaca"); setLoadingSummary(false); return; }
      const income = new Map<number, number>();
      const expense = new Map<number, number>();
      for (const row of iuranResult.data ?? []) if (row.kartu_id) income.set(Number(row.kartu_id), (income.get(Number(row.kartu_id)) ?? 0) + Number(row.nominal ?? 0));
      for (const row of pengeluaranResult.data ?? []) if (row.kartu_id && (row.jenis_keperluan === "Kebutuhan kelompok" || row.jenis_keperluan === "Ke kelompok lain")) expense.set(Number(row.kartu_id), (expense.get(Number(row.kartu_id)) ?? 0) + Number(row.nominal ?? 0));
      const groupBalances = calculateGroupBalances(data ?? [], iuranResult.data ?? [], pengeluaranResult.data ?? [], groupsResult.data ?? []);
      const cards = (data ?? []).map((card) => ({ id: Number(card.id), name: card.nama, note: card.catatan, icon: card.ikon, amount: card.parent_id === null && card.kategori === "Kelompok" ? groupBalances.get(Number(card.id)) ?? 0 : (income.get(Number(card.id)) ?? 0) - (expense.get(Number(card.id)) ?? 0), parentId: card.parent_id ? Number(card.parent_id) : null, category: card.kategori, logoUrl: card.logo_url }));
      setSummaryTotal([...groupBalances.values()].reduce((sum, balance) => sum + balance, 0));
      setFunds(cards.filter((card) => card.parentId === null));
      setLoadingSummary(false);
    };
    void loadCards();
    const channel = client.channel("kas-bendungan-summary").on("postgres_changes", { event: "*", schema: "public", table: "iuran" }, loadCards).on("postgres_changes", { event: "*", schema: "public", table: "pengeluaran" }, loadCards).on("postgres_changes", { event: "*", schema: "public", table: "kartu_kas" }, loadCards).subscribe();
    return () => { void client.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const refreshHome = () => setCardColors(shuffledColors());
    window.addEventListener("home-refresh", refreshHome);
    return () => window.removeEventListener("home-refresh", refreshHome);
  }, []);

  async function addFund(category = "Kelompok") {
    if (category !== "Kelompok") return;
    const name = groupName.trim();
    if (!name) { setNotice("Nama kelompok wajib diisi"); return; }
    if (addingGroup) return;
    setAddingGroup(true);
    let uploaded: { path: string; url: string } | null = null;
    let inserted = false;
    try {
      if (groupLogo) uploaded = await uploadGroupLogo(groupLogo);
      const draft: Fund = { id: nextLocalId++, name, amount: 0, note: "", icon: "+", parentId: null, category, allowMembers, logoUrl: uploaded?.url ?? null };
      if (supabase) {
        const { data, error } = await supabase.from("kartu_kas").insert({ parent_id: null, kategori: category, nama: draft.name, catatan: "", nominal: 0, ikon: "+", allow_tambah_anggota: allowMembers, logo_url: draft.logoUrl }).select("id").single();
        if (error) throw new Error(`Kelompok gagal disimpan: ${error.message}`);
        inserted = true;
        draft.id = Number(data.id);
        const { error: functionError } = await supabase.from("kartu_kas").insert(functionCards.map((card) => ({ parent_id: draft.id, kategori: card.kategori, nama: card.kategori, catatan: card.catatan, nominal: 0, ikon: card.ikon, allow_tambah_anggota: false })));
        if (functionError) { setNotice("Kelompok tersimpan, tetapi kartu fungsi gagal dibuat"); return; }
        if (profile?.id) {
          const { data: group, error: groupLookupError } = await supabase.from("kelompok").select("id").eq("nama", draft.name).limit(1).maybeSingle();
          if (groupLookupError || !group) setNotice("Kelompok tersimpan, tetapi akun pembuat belum terhubung ke kelompok");
          else {
            const { error: membershipError } = await supabase.from("profile_kelompok").upsert({ profile_id: profile.id, kelompok_id: group.id }, { onConflict: "profile_id,kelompok_id" });
            if (membershipError) setNotice("Kelompok tersimpan, tetapi akun pembuat belum terhubung ke kelompok");
          }
        }
      }
      setFunds((current) => [...current, draft]);
      setShowAddMenu(false);
      setAllowMembers(false);
      setGroupName("");
      setGroupLogo(null);
      setNotice(`${category} berhasil ditambahkan`);
      window.setTimeout(() => setNotice(""), 1800);
    } catch (error) {
      if (uploaded && !inserted) await removeGroupLogo(uploaded.path);
      setNotice(error instanceof Error ? error.message : "Kelompok gagal ditambahkan");
    } finally {
      setAddingGroup(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <div className="grain" aria-hidden="true" />
      <section className="hero-row"><div className="balance-card"><div className="balance-top"><span>Total seluruh kas</span>{isSupabaseConfigured && <span className="status-dot">● Terhubung</span>}</div><strong>{loadingSummary ? "Memuat..." : rupiah(summaryTotal)}</strong><div className="balance-bottom"><span>Terakhir diperbarui hari ini</span><span>↗</span></div></div></section>
      <section className="fund-grid" aria-label="Kantong kas bertingkat">
        {funds.map((fund, index) => fund.logoUrl ? <div key={fund.id} className="group-logo-entry"><Link href={`/kartu/${fund.id}`} className="group-logo-link" aria-label={`Buka kelompok ${fund.name}`}><Image className="group-logo-image" src={fund.logoUrl} alt={`Logo ${fund.name}`} width={688} height={682} unoptimized /></Link><div className="group-logo-balance"><strong>{rupiah(fund.amount)}</strong><small>Total saldo {fund.name}</small></div></div> : <Link key={fund.id} href={`/kartu/${fund.id}`} className={`fund-card ${cardColors[index % cardColors.length]}`}><div className="fund-icon">{fund.icon}</div><div className="fund-content"><span className="fund-label">KAS {String(index + 1).padStart(2, "0")}</span><h4>{fund.name}</h4>{fund.note && <p>{fund.note}</p>}<div className="fund-amount">{rupiah(fund.amount)}</div></div><span className="card-arrow">Buka ↗</span></Link>)}
        {canEdit && <button className="add-card" onClick={() => setShowAddMenu((open) => !open)} aria-expanded={showAddMenu}><span className="plus">+</span><span><b>Tambah kartu</b><small>Buat tingkat pembukuan baru</small></span></button>}
      </section>
      {canEdit && showAddMenu && <section className="add-menu" aria-label="Tambah kartu kelompok"><div className="add-menu-heading"><div><span className="fund-label">PEMBUKUAN BERTINGKAT</span><h3>Tambah kartu kelompok</h3></div><button className="panel-close" onClick={() => setShowAddMenu(false)} aria-label="Tutup menu tambah">×</button></div><label className="card-setting"><span>Nama kelompok</span><input value={groupName} onChange={(event) => setGroupName(event.target.value)} aria-label="Nama kelompok" /></label><GroupLogoUpload value={groupLogo} onChange={setGroupLogo} /><label className="card-setting"><input type="checkbox" checked={allowMembers} onChange={(event) => setAllowMembers(event.target.checked)} /> Izinkan penambahan anggota pada kartu ini</label><div className="add-options"><button disabled={addingGroup} onClick={() => void addFund("Kelompok")}><span>▦</span><b>{addingGroup ? "Menyimpan…" : "Kelompok"}</b><small>Otomatis membuat kartu Pemasukan, Pengeluaran, Anggota, dan Laporan</small></button></div></section>}
      <div className="hierarchy-note"><b>Struktur fleksibel</b><span>Desa → RT/RW → kelompok → pembukuan</span></div>
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
