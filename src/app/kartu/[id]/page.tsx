"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

const colors = ["coral", "blue", "mint", "yellow", "lavender", "peach", "sky"];
const addCategories = ["Kelompok", "Pemasukan", "Pengeluaran", "Anggota", "Laporan"] as const;
type Card = { id: number; name: string; note: string; icon: string; amount: number; parentId: number | null; category: string };
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
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const children = useMemo(() => cards.filter((card) => card.parentId === cardId), [cards, cardId]);

  useEffect(() => {
    if (!supabase || !cardId) { queueMicrotask(() => { setCards([]); setCurrent(null); setLoading(false); }); return; }
    const client = supabase;
    const load = async () => {
      const { data, error } = await client.from("kartu_kas").select("id,parent_id,kategori,nama,catatan,nominal,ikon").order("urutan", { ascending: true });
      if (error) { setNotice("Kartu belum bisa dibaca dari database"); setLoading(false); return; }
      const loaded = (data ?? []).map((card) => ({ id: Number(card.id), name: card.nama, note: card.catatan, icon: card.ikon, amount: Number(card.nominal ?? 0), parentId: card.parent_id ? Number(card.parent_id) : null, category: card.kategori }));
      setCards(loaded);
      setCurrent(loaded.find((card) => card.id === cardId) ?? null);
      setLoading(false);
    };
    void load();
  }, [cardId]);

  async function addChild(category: string) {
    if (!current) return;
    const name = window.prompt(`Nama ${category.toLowerCase()} di dalam ${current.name}`, `${category} Baru`);
    if (!name?.trim()) return;
    const draft: Card = { id: nextLocalId++, name: name.trim(), note: `${category} pembukuan baru`, icon: "+", amount: 0, parentId: current.id, category };
    if (supabase) {
      const { data, error } = await supabase.from("kartu_kas").insert({ parent_id: current.id, kategori: category, nama: draft.name, catatan: draft.note, nominal: 0, ikon: "+" }).select("id").single();
      if (error) { setNotice("Subkartu gagal disimpan ke database"); return; }
      draft.id = Number(data.id);
    }
    setCards((existing) => [...existing, draft]);
    setShowAddMenu(false);
    setNotice("Subkartu berhasil ditambahkan");
    window.setTimeout(() => setNotice(""), 1800);
  }

  async function deleteCard(card: Card) {
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

  async function renameCard(card: Card) {
    const name = window.prompt("Nama kelompok baru", card.name)?.trim();
    if (!name || name === card.name) return;
    if (!window.confirm(`Ubah nama kelompok “${card.name}” menjadi “${name}”?`)) return;
    const password = window.prompt("Masukkan password login untuk mengonfirmasi perubahan nama:");
    if (!password) return;
    if (!supabase || !user?.email) { setNotice("Sesi login tidak tersedia"); return; }
    const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password });
    if (authError) { setNotice("Password salah. Nama kelompok tidak diubah."); return; }
    const { error: groupError } = await supabase.from("kelompok").update({ nama: name }).eq("nama", card.name);
    if (groupError) { setNotice("Nama kelompok gagal diubah"); return; }
    const { error: cardError } = await supabase.from("kartu_kas").update({ nama: name }).eq("id", card.id);
    if (cardError) { setNotice("Nama kelompok gagal diubah"); return; }
    setCards((existing) => existing.map((item) => item.id === card.id ? { ...item, name } : item));
    setCurrent((existing) => existing?.id === card.id ? { ...existing, name } : existing);
    setNotice("Nama kelompok berhasil diubah");
    window.setTimeout(() => setNotice(""), 1800);
  }

  if (loading) return <main className="folder-shell"><p className="folder-loading">Membuka folder...</p></main>;
  if (!current) return <main className="folder-shell"><Link href="/" className="back-link">← Kembali ke kartu kas</Link><div className="empty-folder"><h1>Folder tidak ditemukan</h1><p>Kartu ini mungkin sudah dipindahkan atau dihapus.</p></div></main>;

  return <main className="folder-shell"><div className="grain" aria-hidden="true" /><div className="folder-toolbar"><Link href="/" className="back-link">← Semua kartu</Link><span className="folder-path">Ruang pembukuan / {current.name}</span></div><header className="folder-heading"><div><span className="fund-label">FOLDER PEMBUKUAN</span><h1>{current.name}</h1><p>{current.note}</p></div>{canEdit && <div className="folder-actions"><button type="button" className="edit-card folder-edit" onClick={() => void renameCard(current)}>Edit nama</button><button type="button" className="delete-card folder-delete" onClick={() => void deleteCard(current)}>Hapus kelompok</button></div>}</header><div className="folder-balance"><div className="balance-top"><span>Saldo folder</span><span>Terakhir diperbarui hari ini</span></div><strong>{rupiah(current.amount)}</strong><div className="balance-bottom"><span>Kas yang tersedia di folder ini</span><span>↗</span></div></div><div className="folder-divider" /><section className="folder-section"><div className="folder-grid">{children.map((card, index) => <Link key={card.id} href={`/kartu/${card.id}`} className={`fund-card ${colors[index % colors.length]}`}><div className="fund-icon">{card.icon}</div><div className="fund-content"><span className="fund-label">{card.category.toUpperCase()}</span><h4>{card.name}</h4><p>{card.note}</p></div><div className="fund-amount">{rupiah(card.amount)}</div><span className="card-arrow">Buka ↗</span></Link>)}</div></section>{canEdit && showAddMenu && <section className="add-menu"><div className="add-menu-heading"><div><span className="fund-label">FOLDER BERTINGKAT</span><h3>Tambah isi folder</h3></div><button className="panel-close" onClick={() => setShowAddMenu(false)} aria-label="Tutup menu tambah">×</button></div><div className="add-options">{addCategories.map((category) => <button key={category} onClick={() => addChild(category)}><span>{category === "Kelompok" ? "▦" : category === "Pemasukan" ? "↗" : category === "Pengeluaran" ? "↘" : category === "Anggota" ? "♙" : "▤"}</span><b>{category}</b><small>Buat kartu {category.toLowerCase()}</small></button>)}</div></section>}{canEdit && <button className="add-card folder-add-card" onClick={() => setShowAddMenu((open) => !open)} aria-expanded={showAddMenu}><span className="plus">+</span><span><b>Tambah kartu di sini</b><small>Buat folder bertingkat di dalam {current.name}</small></span></button>}<section className="folder-caption"><span className="fund-label">ISI FOLDER</span><h3>{children.length ? `${children.length} kartu di dalam` : "Belum ada subkartu"}</h3><span className="folder-hint">Klik kartu untuk membuka folder berikutnya</span></section>{notice && <div className="toast">{notice}</div>}</main>;
}
