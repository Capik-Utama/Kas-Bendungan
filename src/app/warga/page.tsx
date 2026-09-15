"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

type Group = { id: number; nama: string };
type GroupCard = { id: number; nama: string; parent_id: number | null; kategori: string; allow_tambah_anggota: boolean };
type Warga = { id: number; nama: string; kelompok: string; nik_kk: string | null; nik_ktp: string | null; nomor_telepon: string | null; warga_kelompok?: { kelompok_id: number }[] };

export default function WargaPage() {
  const { canEdit, user } = useAuth();
  const searchParams = useSearchParams();
  const groupFilter = searchParams.get("kelompok");
  const [items, setItems] = useState<Warga[]>([]); const [groups, setGroups] = useState<Group[]>([]); const [selectedGroups, setSelectedGroups] = useState<number[]>([]); const [editing, setEditing] = useState<Warga | null>(null);
  const [nama, setNama] = useState(""); const [nikKk, setNikKk] = useState(""); const [nikKtp, setNikKtp] = useState(""); const [nomorTelepon, setNomorTelepon] = useState(""); const [error, setError] = useState<string | null>(supabase ? null : "Supabase belum dikonfigurasi.");

  const loadWarga = async () => { if (!supabase) return; const { data, error: loadError } = await supabase.from("warga").select("id, nama, kelompok, nik_kk, nik_ktp, nomor_telepon, warga_kelompok(kelompok_id)").order("nama", { ascending: true }); if (loadError) { setError(loadError.message); return; } setItems((data as Warga[]) ?? []); };
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
  const resetForm = () => { setNama(""); setNikKk(""); setNikKtp(""); setNomorTelepon(""); setSelectedGroups([]); setEditing(null); };
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

  const startEdit = (item: Warga) => { setEditing(item); setNama(item.nama); setNikKk(item.nik_kk || ""); setNikKtp(item.nik_ktp || ""); setNomorTelepon(item.nomor_telepon || ""); setSelectedGroups((item.warga_kelompok || []).map((membership) => membership.kelompok_id)); };
  const visibleItems = groupFilter ? items.filter((item) => (item.warga_kelompok || []).some((membership) => groups.find((group) => group.id === membership.kelompok_id)?.nama === groupFilter)) : items;
  const groupChecklist = <fieldset className="grid gap-2 sm:grid-cols-2"><legend className="mb-1 text-sm font-medium text-zinc-700">Kelompok <span className="text-xs font-normal text-zinc-500">(pilih satu atau lebih)</span></legend>{groups.map((group) => <label key={group.id} className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2"><input type="checkbox" checked={selectedGroups.includes(group.id)} onChange={() => toggleGroup(group.id)} />{group.nama}</label>)}</fieldset>;

  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Data Anggota{groupFilter ? ` - ${groupFilter}` : ""}</h1><p className="text-sm text-zinc-600">{groupFilter ? `Menampilkan anggota yang mengikuti kelompok ${groupFilter} saja.` : "Satu anggota dapat mengikuti beberapa kelompok sekaligus."}</p>{canEdit && <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-3"><input required value={nama} onChange={(event) => setNama(event.target.value)} placeholder="Nama anggota *" className="rounded-lg border border-zinc-300 px-3 py-2" />{groupChecklist}<input value={nikKk} onChange={(event) => setNikKk(event.target.value)} placeholder="NIK KK (opsional)" className="rounded-lg border border-zinc-300 px-3 py-2" /><input value={nikKtp} onChange={(event) => setNikKtp(event.target.value)} placeholder="NIK KTP (opsional)" className="rounded-lg border border-zinc-300 px-3 py-2" /><input value={nomorTelepon} onChange={(event) => setNomorTelepon(event.target.value)} placeholder="No. HP (opsional)" className="rounded-lg border border-zinc-300 px-3 py-2" /><div className="flex gap-2"><button className="rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-700" type="submit">{editing ? "Simpan Perubahan" : "Simpan Anggota"}</button>{editing && <button className="rounded-lg border border-zinc-300 px-3 py-2" type="button" onClick={resetForm}>Batal</button>}</div></form>} {error ? <p className="text-sm text-red-600">{error}</p> : null}<div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-zinc-100 text-zinc-700"><tr><th className="px-4 py-3">Nama Anggota</th><th className="px-4 py-3">Kelompok</th><th className="px-4 py-3">NIK KK</th><th className="px-4 py-3">NIK KTP</th><th className="px-4 py-3">No. HP</th><th className="px-4 py-3">Aksi</th></tr></thead><tbody>{visibleItems.map((item) => <tr key={item.id} className="border-t border-zinc-200"><td className="px-4 py-3">{item.nama}</td><td className="px-4 py-3">{(item.warga_kelompok || []).map((membership) => groups.find((group) => group.id === membership.kelompok_id)?.nama).filter(Boolean).join(", ") || item.kelompok || "-"}</td><td className="px-4 py-3">{item.nik_kk || "-"}</td><td className="px-4 py-3">{item.nik_ktp || "-"}</td><td className="px-4 py-3">{item.nomor_telepon || "-"}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2">{canEdit && <button className="rounded border border-zinc-300 px-2 py-1" type="button" onClick={() => startEdit(item)}>Edit</button>}{canEdit && <button className="rounded border border-red-300 px-2 py-1 text-red-700" type="button" onClick={() => void deleteMember(item)}>Hapus</button>}</div></td></tr>)}{visibleItems.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-zinc-500">Belum ada data anggota{groupFilter ? ` di ${groupFilter}` : ""}.</td></tr> : null}</tbody></table></div></section>;
}
