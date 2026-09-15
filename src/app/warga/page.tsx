"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

type Group = { id: number; nama: string };
type GroupCard = { id: number; nama: string; parent_id: number | null; kategori: string; allow_tambah_anggota: boolean };
type Warga = {
  id: number;
  nama: string;
  kelompok: string;
  nik_kk: string | null;
  nik_ktp: string | null;
  nomor_telepon: string | null;
  warga_kelompok?: { kelompok_id: number }[];
};
type Iuran = { warga_id: number | null; nominal: number | string | null };

const money = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;

export default function WargaPage() {
  const { canEdit, user } = useAuth();
  const searchParams = useSearchParams();
  const groupFilter = searchParams.get("kelompok");
  const [items, setItems] = useState<Warga[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [totals, setTotals] = useState<Record<number, number>>({});
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [editing, setEditing] = useState<Warga | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [nama, setNama] = useState("");
  const [nikKk, setNikKk] = useState("");
  const [nikKtp, setNikKtp] = useState("");
  const [nomorTelepon, setNomorTelepon] = useState("");
  const [sortKey, setSortKey] = useState<"nama" | "nomor_telepon" | "total_iuran" | "kelompok" | "nik_ktp" | "nik_kk">("nama");
  const [sortAsc, setSortAsc] = useState(true);
  const [error, setError] = useState<string | null>(supabase ? null : "Supabase belum dikonfigurasi.");

  const loadWarga = async () => {
    if (!supabase) return;
    const [{ data, error: loadError }, { data: iuranData, error: iuranError }] = await Promise.all([
      supabase.from("warga").select("id, nama, kelompok, nik_kk, nik_ktp, nomor_telepon, warga_kelompok(kelompok_id)").order("nama", { ascending: true }),
      supabase.from("iuran").select("warga_id, nominal"),
    ]);
    if (loadError || iuranError) { setError(loadError?.message || iuranError?.message || "Data anggota belum bisa dibaca."); return; }
    const nextTotals: Record<number, number> = {};
    for (const row of (iuranData as Iuran[] ?? [])) if (row.warga_id) nextTotals[row.warga_id] = (nextTotals[row.warga_id] ?? 0) + Number(row.nominal ?? 0);
    setTotals(nextTotals);
    setItems((data as Warga[]) ?? []);
  };

  const loadGroups = async () => {
    if (!supabase) return;
    const [{ data: groupData, error: groupError }, { data: cardData, error: cardError }] = await Promise.all([
      supabase.from("kelompok").select("id, nama").order("nama"),
      supabase.from("kartu_kas").select("id, nama").eq("kategori", "Kelompok").order("nama"),
    ]);
    if (groupError || cardError) { setError(groupError?.message || cardError?.message || "Kelompok belum bisa dibaca."); return; }
    const existingNames = new Set((groupData as Group[] ?? []).map((group) => group.nama));
    const missingNames = (cardData ?? []).map((card) => String(card.nama)).filter((name) => !existingNames.has(name));
    if (missingNames.length) {
      const { error: syncError } = await supabase.from("kelompok").upsert(missingNames.map((nama) => ({ nama })), { onConflict: "nama" });
      if (syncError) { setError(syncError.message); return; }
    }
    const { data: refreshedGroups, error: refreshError } = await supabase.from("kelompok").select("id, nama").order("nama");
    if (refreshError) { setError(refreshError.message); return; }
    setGroups((refreshedGroups as Group[]) ?? []);
  };

  useEffect(() => { const timeout = setTimeout(() => { void loadWarga(); void loadGroups(); }, 0); return () => clearTimeout(timeout); }, []);

  const resetForm = () => { setNama(""); setNikKk(""); setNikKtp(""); setNomorTelepon(""); setSelectedGroups([]); setEditing(null); setShowForm(false); };
  const toggleGroup = (id: number) => setSelectedGroups((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const saveGroups = async (wargaId: number) => { if (!supabase) return null; const { error: deleteError } = await supabase.from("warga_kelompok").delete().eq("warga_id", wargaId); if (deleteError) return deleteError; const { error: insertError } = await supabase.from("warga_kelompok").insert(selectedGroups.map((kelompok_id) => ({ warga_id: wargaId, kelompok_id }))); return insertError; };
  const ensureMemberCards = async () => {
    if (!supabase) return;
    const selectedNames = groups.filter((group) => selectedGroups.includes(group.id)).map((group) => group.nama);
    if (!selectedNames.length) return;
    const { data: cards } = await supabase.from("kartu_kas").select("id,nama,parent_id,kategori,allow_tambah_anggota").eq("kategori", "Kelompok").in("nama", selectedNames);
    for (const card of (cards as GroupCard[] ?? []).filter((item) => item.allow_tambah_anggota)) {
      const { data: existing } = await supabase.from("kartu_kas").select("id").eq("parent_id", card.id).eq("kategori", "Anggota").limit(1);
      if (!existing?.length) await supabase.from("kartu_kas").insert({ parent_id: card.id, kategori: "Anggota", nama: "Anggota", catatan: "Anggota yang terdaftar di kelompok ini", nominal: 0, ikon: "♙" });
    }
  };

  const deleteMember = async (item: Warga) => {
    const mode = window.prompt(`Hapus ${item.nama}. Ketik “kembalikan” untuk menjadikan iuran sebagai pengeluaran, atau “pertahankan” untuk tetap mencatatnya:`)?.trim().toLowerCase();
    if (mode !== "kembalikan" && mode !== "pertahankan") return;
    const password = window.prompt("Masukkan password login untuk mengonfirmasi penghapusan anggota:");
    if (!password || !supabase || !user?.email) { setError("Sesi login tidak tersedia."); return; }
    const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password });
    if (authError) { setError("Password salah. Anggota tidak dihapus."); return; }
    const { data: transactions, error: transactionError } = await supabase.from("iuran").select("id, nominal").eq("warga_id", item.id);
    if (transactionError) { setError(transactionError.message); return; }
    if (mode === "kembalikan" && transactions?.length) {
      const refunds = transactions.map((transaction) => ({ tanggal: new Date().toISOString().slice(0, 10), keperluan: `Pengembalian iuran ${item.nama}`, nominal: Number(transaction.nominal), keterangan: "Otomatis saat anggota dihapus" }));
      const { error: refundError } = await supabase.from("pengeluaran").insert(refunds);
      if (refundError) { setError(refundError.message); return; }
      const { error: deleteTransactionError } = await supabase.from("iuran").delete().eq("warga_id", item.id);
      if (deleteTransactionError) { setError(deleteTransactionError.message); return; }
    } else if (mode === "pertahankan" && transactions?.length) {
      const { error: detachError } = await supabase.from("iuran").update({ warga_id: null }).eq("warga_id", item.id);
      if (detachError) { setError(detachError.message); return; }
    }
    await supabase.from("warga_kelompok").delete().eq("warga_id", item.id);
    const { error: deleteError } = await supabase.from("warga").delete().eq("id", item.id);
    if (deleteError) { setError(deleteError.message); return; }
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    setError(null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!supabase) return; setError(null); if (!nama.trim() || !selectedGroups.length) { setError("Nama anggota dan minimal satu kelompok wajib diisi."); return; }
    const kelompokUtama = groups.find((group) => group.id === selectedGroups[0])?.nama || "";
    const payload = { nama: nama.trim(), kelompok: kelompokUtama, nik_kk: nikKk.trim() || null, nik_ktp: nikKtp.trim() || null, nomor_telepon: nomorTelepon.trim() || null };
    let wargaId: number;
    if (editing) { const { error: updateError } = await supabase.from("warga").update(payload).eq("id", editing.id); if (updateError) { setError(updateError.message); return; } wargaId = editing.id; } else { const { data, error: insertError } = await supabase.from("warga").insert(payload).select("id").single(); if (insertError || !data) { setError(insertError?.message || "Gagal menyimpan anggota."); return; } wargaId = data.id as number; }
    const groupError = await saveGroups(wargaId); if (groupError) { setError(groupError.message); return; }
    await ensureMemberCards();
    resetForm(); await loadWarga();
  };

  const sortedItems = useMemo(() => [...(groupFilter ? items.filter((item) => (item.warga_kelompok || []).some((membership) => groups.find((group) => group.id === membership.kelompok_id)?.nama === groupFilter)) : items)].sort((a, b) => {
    const groupName = (item: Warga) => (item.warga_kelompok || []).map((membership) => groups.find((group) => group.id === membership.kelompok_id)?.nama).filter(Boolean).join(", ") || item.kelompok || "";
    const value = (item: Warga) => sortKey === "total_iuran" ? (totals[item.id] ?? 0) : sortKey === "kelompok" ? groupName(item) : String(item[sortKey] ?? "");
    const left = value(a); const right = value(b);
    const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "id", { sensitivity: "base" });
    return sortAsc ? result : -result;
  }), [groupFilter, groups, items, sortAsc, sortKey, totals]);
  const toggleSort = (key: typeof sortKey) => { if (sortKey === key) setSortAsc((value) => !value); else { setSortKey(key); setSortAsc(key === "nama"); } };
  const sortLabel = (key: typeof sortKey) => sortKey === key ? (sortAsc ? " ↑" : " ↓") : " ↕";

  const startEdit = (item: Warga) => { setEditing(item); setNama(item.nama); setNikKk(item.nik_kk || ""); setNikKtp(item.nik_ktp || ""); setNomorTelepon(item.nomor_telepon || ""); setSelectedGroups((item.warga_kelompok || []).map((membership) => membership.kelompok_id)); setShowForm(true); };
  const groupChecklist = <fieldset className="grid gap-2 sm:grid-cols-3"><legend className="mb-1 text-sm font-medium text-zinc-700">Kelompok <span className="text-xs font-normal text-zinc-500">(pilih satu atau lebih)</span></legend>{groups.map((group) => <label key={group.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2"><input type="checkbox" checked={selectedGroups.includes(group.id)} onChange={() => toggleGroup(group.id)} /><span className="whitespace-nowrap">{group.nama}</span></label>)}</fieldset>;

  return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Data Anggota{groupFilter ? ` - ${groupFilter}` : ""}</h1><p className="text-sm text-zinc-600">{groupFilter ? `Menampilkan anggota yang mengikuti kelompok ${groupFilter} saja.` : "Satu anggota dapat mengikuti beberapa kelompok sekaligus."}</p></div>{canEdit && <button type="button" onClick={() => { setEditing(null); setShowForm((current) => !current); }} className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-[.98]">{showForm && !editing ? "Tutup Form" : "+ Tambah Anggota"}</button>}</div>
    {canEdit && showForm && <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-3"><input required value={nama} onChange={(event) => setNama(event.target.value)} placeholder="Nama anggota *" className="rounded-lg border border-zinc-300 px-3 py-2" />{groupChecklist}<input value={nomorTelepon} onChange={(event) => setNomorTelepon(event.target.value)} placeholder="No. HP (opsional)" className="rounded-lg border border-zinc-300 px-3 py-2" /><input value={nikKtp} onChange={(event) => setNikKtp(event.target.value)} placeholder="NIK KTP (opsional)" className="rounded-lg border border-zinc-300 px-3 py-2" /><input value={nikKk} onChange={(event) => setNikKk(event.target.value)} placeholder="NIK KK (opsional)" className="rounded-lg border border-zinc-300 px-3 py-2" /><div className="flex gap-2"><button className="rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-700" type="submit">{editing ? "Simpan Perubahan" : "Simpan Anggota"}</button>{editing && <button className="rounded-lg border border-zinc-300 px-3 py-2" type="button" onClick={resetForm}>Batal</button>}</div></form>}
    {error ? <p className="text-sm text-red-600">{error}</p> : null}
    <div className="max-h-[min(68vh,720px)] overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-sm"><table className="min-w-[980px] text-left text-sm"><thead className="sticky top-0 z-10 bg-zinc-100 text-zinc-700"><tr>{([ ["nama", "Nama"], ["nomor_telepon", "No. HP"], ["total_iuran", "Total Iuran"], ["kelompok", "Kelompok"], ["nik_ktp", "NIK KTP"], ["nik_kk", "NIK KK"] ] as const).map(([key, label]) => <th key={key} className="whitespace-nowrap px-4 py-3"><button type="button" onClick={() => toggleSort(key)} className="font-semibold hover:text-emerald-700">{label}{sortLabel(key)}</button></th>)}<th className="whitespace-nowrap px-4 py-3">Aksi</th></tr></thead><tbody>{sortedItems.map((item) => <tr key={item.id} className="border-t border-zinc-200 align-top"><td className="whitespace-nowrap px-4 py-3 font-medium">{item.nama}</td><td className="whitespace-nowrap px-4 py-3">{item.nomor_telepon || "-"}</td><td className="whitespace-nowrap px-4 py-3">{money(totals[item.id] ?? 0)}</td><td className="whitespace-nowrap px-4 py-3">{(item.warga_kelompok || []).map((membership) => groups.find((group) => group.id === membership.kelompok_id)?.nama).filter(Boolean).join(", ") || item.kelompok || "-"}</td><td className="whitespace-nowrap px-4 py-3">{item.nik_ktp || "-"}</td><td className="whitespace-nowrap px-4 py-3">{item.nik_kk || "-"}</td><td className="whitespace-nowrap px-4 py-3"><div className="flex gap-2">{canEdit && <button className="rounded border border-zinc-300 px-2 py-1" type="button" onClick={() => startEdit(item)}>Edit</button>}{canEdit && <button className="rounded border border-red-300 px-2 py-1 text-red-700" type="button" onClick={() => void deleteMember(item)}>Hapus</button>}</div></td></tr>)}{sortedItems.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-zinc-500">Belum ada data anggota{groupFilter ? ` di ${groupFilter}` : ""}.</td></tr> : null}</tbody></table></div></section>;
}
