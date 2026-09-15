"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

const colors = ["coral", "blue", "mint", "yellow", "lavender", "peach", "sky"];
const functionCards = [
  { kategori: "Pemasukan", ikon: "↗", catatan: "" },
  { kategori: "Pengeluaran", ikon: "↘", catatan: "" },
  { kategori: "Anggota", ikon: "♙", catatan: "" },
  { kategori: "Laporan", ikon: "▤", catatan: "" },
] as const;
type Card = { id: number; name: string; note: string; icon: string; amount: number; displayValue?: string; parentId: number | null; category: string; allowMembers?: boolean };
let nextLocalId = 200000;
function rupiah(value: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value); }

export default function CardFolderPage() {
  const { canEdit, user } = useAuth();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const cardId = Number(params.id);
  const [cards, setCards] = useState<Card[]>([]);
  const [current, setCurrent] = useState<Card | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showEditMenu, setShowEditMenu] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAllowMembers, setEditAllowMembers] = useState(false);
  const [allowMembers, setAllowMembers] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const children = useMemo(() => cards.filter((card) => card.parentId === cardId), [cards, cardId]);
  const canManageCurrent = canEdit && current?.category === "Kelompok";
  function functionHref(card: Card) {
    const parent = cards.find((item) => item.id === card.parentId);
    if (!parent) return `/kartu/${card.id}`;
    if (card.category === "Pemasukan") return `/iuran?kartu_id=${parent.id}`;
    if (card.category === "Pengeluaran") return `/pengeluaran?kartu_id=${parent.id}`;
    if (card.category === "Anggota") return `/warga?kelompok=${encodeURIComponent(parent.name)}`;
    if (card.category === "Laporan") return `/riwayat?kartu_id=${parent.id}`;
    return `/kartu/${card.id}`;
  }

  useEffect(() => {
    if (!supabase || !cardId) { queueMicrotask(() => { setCards([]); setCurrent(null); setLoading(false); }); return; }
    const client = supabase;
    const load = async () => {
      const [{ data, error }, iuranResult, pengeluaranResult, groupsResult, wargaResult] = await Promise.all([
        client.from("kartu_kas").select("id,parent_id,kategori,nama,catatan,nominal,ikon,allow_tambah_anggota").order("urutan", { ascending: true }),
        client.from("iuran").select("kartu_id,nominal,tanggal_bayar"),
        client.from("pengeluaran").select("kartu_id,nominal,tanggal"),
        client.from("kelompok").select("id,nama"),
        client.from("warga").select("id,warga_kelompok(kelompok_id)"),
      ]);
      if (error || iuranResult.error || pengeluaranResult.error || groupsResult.error || wargaResult.error) { setNotice("Kartu atau saldo belum bisa dibaca dari database"); setLoading(false); return; }
      const income = new Map<number, number>();
      const expense = new Map<number, number>();
      const latest = new Map<number, string>();
      for (const row of iuranResult.data ?? []) if (row.kartu_id) { const id = Number(row.kartu_id); income.set(id, (income.get(id) ?? 0) + Number(row.nominal ?? 0)); const date = String(row.tanggal_bayar ?? ""); if (date > (latest.get(id) ?? "")) latest.set(id, date); }
      for (const row of pengeluaranResult.data ?? []) if (row.kartu_id) { const id = Number(row.kartu_id); expense.set(id, (expense.get(id) ?? 0) + Number(row.nominal ?? 0)); const date = String(row.tanggal ?? ""); if (date > (latest.get(id) ?? "")) latest.set(id, date); }
      const groupById = new Map((groupsResult.data ?? []).map((group) => [Number(group.id), String(group.nama)]));
      const memberCounts = new Map<number, number>();
      for (const warga of wargaResult.data ?? []) for (const membership of warga.warga_kelompok ?? []) { const id = Number(membership.kelompok_id); memberCounts.set(id, (memberCounts.get(id) ?? 0) + 1); }
      const loaded = (data ?? []).map((card) => {
        const id = Number(card.id); const parentId = card.parent_id ? Number(card.parent_id) : null; const groupId = parentId ? [...groupById.entries()].find(([, name]) => name === (data ?? []).find((parent) => Number(parent.id) === parentId)?.nama)?.[0] ?? null : null;
        const childAmount = card.kategori === "Pemasukan" ? (parentId ? income.get(parentId) ?? 0 : 0) : card.kategori === "Pengeluaran" ? (parentId ? expense.get(parentId) ?? 0 : 0) : card.kategori === "Anggota" ? (groupId ? memberCounts.get(groupId) ?? 0 : 0) : 0;
        const displayValue = card.kategori === "Anggota" ? `${childAmount} anggota` : card.kategori === "Laporan" ? (parentId && latest.get(parentId) ? `Terakhir: ${latest.get(parentId)}` : "Belum ada transaksi") : undefined;
        return { id, name: card.nama, note: "", icon: card.ikon, amount: card.parent_id ? childAmount : (income.get(id) ?? 0) - (expense.get(id) ?? 0), displayValue, parentId, category: card.kategori, allowMembers: Boolean(card.allow_tambah_anggota) };
      });
      setCards(loaded);
      setCurrent(loaded.find((card) => card.id === cardId) ?? null);
      setLoading(false);
    };
    void load();
  }, [cardId]);

  async function addChild(category: string) {
    if (!current || current.category !== "Kelompok" || category !== "Kelompok") return;
    const name = window.prompt(`Nama ${category.toLowerCase()} di dalam ${current.name}`, `${category} Baru`);
    if (!name?.trim()) return;
    const draft: Card = { id: nextLocalId++, name: name.trim(), note: "", icon: "+", amount: 0, parentId: current.id, category, allowMembers };
    if (supabase) {
      const { data, error } = await supabase.from("kartu_kas").insert({ parent_id: current.id, kategori: category, nama: draft.name, catatan: "", nominal: 0, ikon: "+", allow_tambah_anggota: category === "Kelompok" && allowMembers }).select("id").single();
      if (error) { setNotice("Subkartu gagal disimpan ke database"); return; }
      draft.id = Number(data.id);
      const { data: functionData, error: functionError } = await supabase.from("kartu_kas").insert(functionCards.map((card) => ({ parent_id: draft.id, kategori: card.kategori, nama: card.kategori, catatan: card.catatan, nominal: 0, ikon: card.ikon, allow_tambah_anggota: false }))).select("id,parent_id,kategori,nama,catatan,nominal,ikon,allow_tambah_anggota");
      if (functionError) { setNotice("Kelompok tersimpan, tetapi kartu fungsi gagal dibuat"); return; }
      setCards((existing) => [...existing, draft, ...(functionData ?? []).map((card) => ({ id: Number(card.id), name: card.nama, note: card.catatan, icon: card.ikon, amount: Number(card.nominal ?? 0), parentId: Number(card.parent_id), category: card.kategori, allowMembers: Boolean(card.allow_tambah_anggota) }))]);
      setShowAddMenu(false);
      setAllowMembers(false);
      setNotice("Kelompok dan kartu fungsi berhasil ditambahkan");
      window.setTimeout(() => setNotice(""), 1800);
      return;
    }
    setCards((existing) => [...existing, draft]);
    setShowAddMenu(false);
    setAllowMembers(false);
    setNotice("Subkartu berhasil ditambahkan");
    window.setTimeout(() => setNotice(""), 1800);
  }

  async function deleteCard(card: Card) {
    if (card.category !== "Kelompok") return;
    if (!window.confirm(`Hapus kelompok “${card.name}” beserta seluruh isi di dalamnya?`)) return;
    const password = window.prompt("Masukkan password login untuk mengonfirmasi penghapusan:");
    if (!password) return;
    if (!supabase || !user?.email) { setNotice("Sesi login tidak tersedia"); return; }
    const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password });
    if (authError) { setNotice("Password salah. Kelompok tidak dihapus."); return; }
    const { error } = await supabase.from("kartu_kas").delete().eq("id", card.id);
    if (error) { setNotice("Kelompok gagal dihapus"); return; }
    await supabase.from("kelompok").delete().eq("nama", card.name);
    setCards((existing) => existing.filter((item) => item.id !== card.id));
    if (card.id === current?.id) { router.push("/"); return; }
    setNotice("Kelompok berhasil dihapus");
    window.setTimeout(() => setNotice(""), 1800);
  }

  function openEditMenu(card: Card) {
    setEditName(card.name);
    setEditAllowMembers(Boolean(card.allowMembers));
    setShowEditMenu(true);
    setShowAddMenu(false);
  }

  async function saveCardSettings() {
    if (!current || current.category !== "Kelompok") return;
    const name = editName.trim();
    if (!name) { setNotice("Nama kelompok wajib diisi"); return; }
    if (!supabase || !user?.email) { setNotice("Sesi login tidak tersedia"); return; }
    const password = window.prompt("Masukkan password login untuk mengonfirmasi perubahan kartu:");
    if (!password) return;
    const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password });
    if (authError) { setNotice("Password salah. Pengaturan kartu tidak diubah."); return; }
    const { error: cardError } = await supabase.from("kartu_kas").update({ nama: name, allow_tambah_anggota: current.category === "Kelompok" && editAllowMembers }).eq("id", current.id);
    if (cardError) { setNotice("Pengaturan kartu gagal disimpan"); return; }
    if (name !== current.name) {
      const { error: groupError } = await supabase.from("kelompok").update({ nama: name }).eq("nama", current.name);
      if (groupError) { setNotice("Nama kartu tersimpan, tetapi nama kelompok gagal disinkronkan"); return; }
    }
    const updated = { ...current, name, allowMembers: current.category === "Kelompok" && editAllowMembers };
    setCards((existing) => existing.map((item) => item.id === current.id ? updated : item));
    setCurrent(updated);
    setShowEditMenu(false);
    setNotice("Pengaturan kartu berhasil disimpan dan disinkronkan");
    window.setTimeout(() => setNotice(""), 2200);
  }

  if (loading) return <main className="folder-shell"><p className="folder-loading">Membuka kelompok...</p></main>;
  if (!current) return <main className="folder-shell"><Link href="/" className="back-link">← Kembali ke kartu kas</Link><div className="empty-folder"><h1>Kelompok tidak ditemukan</h1><p>Kartu ini mungkin sudah dipindahkan atau dihapus.</p></div></main>;

  return <main className="folder-shell"><div className="grain" aria-hidden="true" /><div className="folder-toolbar"><Link href="/" className="back-link">← Semua kartu</Link><span className="folder-path">Ruang kelompok / {current.name}</span></div><header className="folder-heading"><div><span className="fund-label">{current.category === "Kelompok" ? "KELOMPOK" : current.category.toUpperCase()}</span><h1>{current.name}</h1>{current.note && <p>{current.note}</p>}</div>{canManageCurrent && <div className="folder-actions"><button type="button" className="edit-card folder-edit" onClick={() => openEditMenu(current)}>Edit kartu</button><button type="button" className="delete-card folder-delete" onClick={() => void deleteCard(current)}>Hapus kelompok</button></div>}</header><div className="folder-balance"><div className="balance-top"><span>Saldo kelompok</span><span>Terakhir diperbarui hari ini</span></div><strong>{rupiah(current.amount)}</strong><div className="balance-bottom"><span>Kas yang tersedia di Kelompok ini</span><span>↗</span></div></div><div className="folder-divider" /><section className="folder-section"><div className="folder-grid">{children.map((card, index) => <Link key={card.id} href={functionHref(card)} className={`fund-card ${colors[index % colors.length]}`}><div className="fund-icon">{card.icon}</div><div className="fund-content"><span className="fund-label">{card.category.toUpperCase()}</span><h4>{card.name}</h4>{card.note && <p>{card.note}</p>}<div className="fund-amount">{card.displayValue ?? (card.category === "Anggota" ? `${card.amount} anggota` : card.category === "Laporan" ? "Belum ada transaksi" : rupiah(card.amount))}</div></div><span className="card-arrow">Buka ↗</span></Link>)}</div></section>{canManageCurrent && showEditMenu && <section className="add-menu card-edit-menu"><div className="add-menu-heading"><div><span className="fund-label">PENGATURAN KARTU</span><h3>Edit kartu kelompok</h3></div><button className="panel-close" onClick={() => setShowEditMenu(false)} aria-label="Tutup pengaturan kartu">×</button></div><label className="card-setting"><span>Nama kartu</span><input value={editName} onChange={(event) => setEditName(event.target.value)} aria-label="Nama kartu" /></label><label className="card-setting"><input type="checkbox" checked={editAllowMembers} onChange={(event) => setEditAllowMembers(event.target.checked)} /> Izinkan penambahan anggota pada kartu ini</label><div className="edit-menu-actions"><button type="button" className="edit-card" onClick={() => void saveCardSettings()}>Simpan pengaturan</button><button type="button" className="panel-close" onClick={() => setShowEditMenu(false)}>Batal</button></div></section>}{canManageCurrent && showAddMenu && <section className="add-menu"><div className="add-menu-heading"><div><span className="fund-label">KELOMPOK BERTINGKAT</span><h3>Tambah subkelompok</h3></div><button className="panel-close" onClick={() => setShowAddMenu(false)} aria-label="Tutup menu tambah">×</button></div><label className="card-setting"><input type="checkbox" checked={allowMembers} onChange={(event) => setAllowMembers(event.target.checked)} /> Izinkan penambahan anggota pada subkelompok ini</label><div className="add-options"><button onClick={() => void addChild("Kelompok")}><span>▦</span><b>Kelompok</b><small>Otomatis membuat kartu fungsi</small></button></div></section>}{canManageCurrent && <button className="add-card folder-add-card" onClick={() => { setShowAddMenu((open) => !open); setShowEditMenu(false); }} aria-expanded={showAddMenu}><span className="plus">+</span><span><b>Tambah subkelompok</b><small>Buat kelompok bertingkat di dalam {current.name}</small></span></button>}<section className="folder-caption"><span className="fund-label">ISI KELOMPOK</span><h3>{children.length ? `${children.length} kartu di dalam` : "Belum ada subkartu"}</h3><span className="folder-hint">Klik kartu fungsi untuk membuka data kelompok</span></section>{notice && <div className="toast">{notice}</div>}</main>;
}
