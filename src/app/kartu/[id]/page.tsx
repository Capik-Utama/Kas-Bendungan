"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const colors = ["coral", "blue", "mint", "yellow", "lavender", "peach", "sky"];
const starterCards: Card[] = [
  { id: 1, name: "Kematian", amount: 5000000, note: "Dana sosial warga", icon: "✦", parentId: null, category: "Kelompok" },
  { id: 2, name: "Pemuda", amount: 15000000, note: "Kegiatan pemuda", icon: "⌁", parentId: null, category: "Kelompok" },
  { id: 3, name: "Kampung", amount: 2000000, note: "Operasional kampung", icon: "⌂", parentId: null, category: "Kelompok" },
  { id: 4, name: "Umum", amount: 7000000, note: "Keperluan umum", icon: "◌", parentId: null, category: "Kelompok" },
];
const modules = [["Pemasukan", "Catat iuran dan dana masuk", "↗", "/iuran"], ["Pengeluaran", "Kelola belanja dan biaya", "↘", "/pengeluaran"], ["Anggota", "Daftar warga atau anggota", "♙", "/warga"], ["Laporan", "Lihat rekap pembukuan", "▤", "/riwayat"]] as const;
const addCategories = ["Kelompok", "Pemasukan", "Pengeluaran", "Anggota", "Laporan"] as const;
type Card = { id: number; name: string; note: string; icon: string; amount: number; parentId: number | null; category: string };
let nextLocalId = 200000;
function rupiah(value: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value); }

export default function CardFolderPage() {
  const params = useParams<{ id: string }>();
  const cardId = Number(params.id);
  const [cards, setCards] = useState<Card[]>([]);
  const [current, setCurrent] = useState<Card | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const children = useMemo(() => cards.filter((card) => card.parentId === cardId), [cards, cardId]);

  useEffect(() => {
    if (!supabase || !cardId) { queueMicrotask(() => { setCards(starterCards); setCurrent(starterCards.find((card) => card.id === cardId) ?? null); setLoading(false); }); return; }
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

  if (loading) return <main className="folder-shell"><p className="folder-loading">Membuka folder...</p></main>;
  if (!current) return <main className="folder-shell"><Link href="/" className="back-link">← Kembali ke kartu kas</Link><div className="empty-folder"><h1>Folder tidak ditemukan</h1><p>Kartu ini mungkin sudah dipindahkan atau dihapus.</p></div></main>;

  return <main className="folder-shell"><div className="grain" aria-hidden="true" /><div className="folder-toolbar"><Link href="/" className="back-link">← Semua kartu</Link><span className="folder-path">Ruang pembukuan / {current.name}</span></div><header className="folder-heading"><div><span className="fund-label">FOLDER PEMBUKUAN</span><h1>{current.name}</h1><p>{current.note}</p></div></header><div className="folder-balance"><div className="balance-top"><span>Saldo folder</span><span>Terakhir diperbarui hari ini</span></div><strong>{rupiah(current.amount)}</strong><div className="balance-bottom"><span>Kas yang tersedia di folder ini</span><span>↗</span></div></div><div className="folder-divider" /><section className="folder-section"><div className="section-heading"><div><span className="fund-label">ISI FOLDER</span><h3>{children.length ? `${children.length} kartu di dalam` : "Belum ada subkartu"}</h3></div><span className="folder-hint">Klik kartu untuk membuka folder berikutnya</span></div><div className="folder-grid">{children.map((card, index) => <Link key={card.id} href={`/kartu/${card.id}`} className={`fund-card ${colors[index % colors.length]}`}><div className="fund-icon">{card.icon}</div><div className="fund-content"><span className="fund-label">{card.category.toUpperCase()}</span><h4>{card.name}</h4><p>{card.note}</p></div><div className="fund-amount">{rupiah(card.amount)}</div><span className="card-arrow">Buka ↗</span></Link>)}</div></section>{showAddMenu && <section className="add-menu"><div className="add-menu-heading"><div><span className="fund-label">FOLDER BERTINGKAT</span><h3>Tambah isi folder</h3></div><button className="panel-close" onClick={() => setShowAddMenu(false)} aria-label="Tutup menu tambah">×</button></div><div className="add-options">{addCategories.map((category) => <button key={category} onClick={() => addChild(category)}><span>{category === "Kelompok" ? "▦" : category === "Pemasukan" ? "↗" : category === "Pengeluaran" ? "↘" : category === "Anggota" ? "♙" : "▤"}</span><b>{category}</b><small>Buat kartu {category.toLowerCase()}</small></button>)}</div></section>}<section className="module-section"><span className="fund-label">MODUL FOLDER INI</span><div className="module-grid">{modules.map(([name, detail, icon, href]) => <Link className="module-card fund-card" key={name} href={href}><span className="module-icon">{icon}</span><b>{name}</b><small>{detail}</small><span className="module-arrow">↗</span></Link>)}</div></section><button className="add-card folder-add-card" onClick={() => setShowAddMenu((open) => !open)} aria-expanded={showAddMenu}><span className="plus">+</span><span><b>Tambah kartu di sini</b><small>Buat folder bertingkat di dalam {current.name}</small></span></button>{notice && <div className="toast">{notice}</div>}</main>;
}
