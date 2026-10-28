"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { maskAddress, maskFixed, maskName, maskPhone } from "@/lib/privacy";

type Group = { id: number; nama: string };
type GroupCard = { id: number; nama: string; parent_id: number | null; kategori: string; allow_tambah_anggota: boolean };
type Warga = {
  id: number;
  nama: string;
  kelompok: string;
  nik_kk: string | null;
  nik_ktp: string | null;
  nomor_telepon: string | null;
  alamat_rt: string | null;
  created_at: string;
  warga_kelompok?: { kelompok_id: number }[];
};
type Iuran = { id: number; warga_id: number | null; nominal: number | string | null; keterangan: string | null; kartu_id: number | null; bulan: string; tanggal_bayar: string; created_at: string };
const INITIAL_IURAN_NOTE = "Iuran awal";

const money = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;
const formatAddedDate = (value: string) => new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta", timeZoneName: "short" }).format(new Date(value));

export default function WargaPage() {
  const { canEdit, user, isGuest, profile } = useAuth();
  const isRestricted = isGuest || profile?.role === "anggota";
  const searchParams = useSearchParams();
  const groupFilter = searchParams.get("kelompok");
  const [items, setItems] = useState<Warga[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [totals, setTotals] = useState<Record<number, number>>({});
  const [initialIurans, setInitialIurans] = useState<Record<number, Iuran>>({});
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [editing, setEditing] = useState<Warga | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [nama, setNama] = useState("");
  const [nikKk, setNikKk] = useState("");
  const [nikKtp, setNikKtp] = useState("");
  const [nomorTelepon, setNomorTelepon] = useState("");
  const [iuranAwal, setIuranAwal] = useState("");
  const [sortKey, setSortKey] = useState<"nama" | "created_at" | "nomor_telepon" | "total_iuran" | "kelompok" | "nik_ktp" | "nik_kk">("created_at");
  const [sortAsc, setSortAsc] = useState(true);
  const [error, setError] = useState<string | null>(supabase ? null : "Supabase belum dikonfigurasi.");
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  const loadWarga = async () => {
    if (!supabase) return;
    const [{ data, error: loadError }, { data: iuranData, error: iuranError }] = await Promise.all([
      supabase.from("warga").select("id, nama, kelompok, nik_kk, nik_ktp, nomor_telepon, alamat_rt, created_at, warga_kelompok(kelompok_id)").order("nama", { ascending: true }),
      supabase.from("iuran").select("id, warga_id, nominal, keterangan, kartu_id, bulan, tanggal_bayar, created_at").order("created_at", { ascending: true }).order("id", { ascending: true }),
    ]);
    if (loadError || iuranError) { setError(loadError?.message || iuranError?.message || "Data anggota belum bisa dibaca."); return; }
    const nextTotals: Record<number, number> = {};
    const nextInitialIurans: Record<number, Iuran> = {};
    for (const row of (iuranData as Iuran[] ?? [])) if (row.warga_id) {
      nextTotals[row.warga_id] = (nextTotals[row.warga_id] ?? 0) + Number(row.nominal ?? 0);
      const existingInitial = nextInitialIurans[row.warga_id];
      if (!existingInitial || (row.keterangan === INITIAL_IURAN_NOTE && existingInitial.keterangan !== INITIAL_IURAN_NOTE)) nextInitialIurans[row.warga_id] = row;
    }
    setTotals(nextTotals);
    setInitialIurans(nextInitialIurans);
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
    if (missingNames.length && !isRestricted) {
      const { error: syncError } = await supabase.from("kelompok").upsert(missingNames.map((nama) => ({ nama })), { onConflict: "nama" });
      if (syncError) { setError(syncError.message); return; }
    }
    const { data: refreshedGroups, error: refreshError } = await supabase.from("kelompok").select("id, nama").order("nama");
    if (refreshError) { setError(refreshError.message); return; }
    setGroups((refreshedGroups as Group[]) ?? []);
  };

  useEffect(() => { const timeout = setTimeout(() => { void loadWarga(); void loadGroups(); }, 0); return () => clearTimeout(timeout); }, []);

  const resetForm = () => { setNama(""); setNikKk(""); setNikKtp(""); setNomorTelepon(""); setIuranAwal(""); setSelectedGroups([]); setEditing(null); setShowForm(false); };
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

  const ensureIuranGroupCard = async (groupName: string): Promise<{ id: number | null; error: string | null }> => {
    if (!supabase) return { id: null, error: "Supabase belum dikonfigurasi." };
    const { data: groupCard, error } = await supabase.from("kartu_kas").select("id").eq("kategori", "Kelompok").eq("nama", groupName).is("parent_id", null).limit(1).maybeSingle();
    if (error) return { id: null, error: error.message };
    const createdGroupCard = groupCard ? null : await supabase.from("kartu_kas").insert({ parent_id: null, kategori: "Kelompok", nama: groupName, catatan: "", nominal: 0, ikon: "+", allow_tambah_anggota: false }).select("id").single();
    if (!groupCard && (createdGroupCard?.error || !createdGroupCard?.data)) return { id: null, error: createdGroupCard?.error?.message || "Kartu kelompok gagal dibuat." };
    const groupCardId = Number(groupCard?.id ?? createdGroupCard?.data?.id);
    if (!Number.isFinite(groupCardId)) return { id: null, error: "Kartu kelompok tidak memiliki ID yang valid." };
    const { data: incomeCard, error: incomeError } = await supabase.from("kartu_kas").select("id").eq("parent_id", groupCardId).eq("kategori", "Pemasukan").limit(1).maybeSingle();
    if (incomeError) return { id: null, error: incomeError.message };
    if (!incomeCard) {
      const { error: insertError } = await supabase.from("kartu_kas").insert({ parent_id: groupCardId, kategori: "Pemasukan", nama: "Pemasukan", catatan: "Pemasukan dari transaksi warga", nominal: 0, ikon: "↗" });
      if (insertError) return { id: null, error: insertError.message };
    }
    return { id: groupCardId, error: null };
  };

  const saveInitialIuran = async (wargaId: number, amount: number, groupName: string): Promise<string | null> => {
    if (!supabase) return "Supabase belum dikonfigurasi.";
    const existing = initialIurans[wargaId];
    if (!existing && amount === 0) return null;

    let cardId = existing?.kartu_id ?? null;
    if (amount > 0) {
      const groupCard = await ensureIuranGroupCard(groupName);
      if (groupCard.error || !groupCard.id) return groupCard.error || "Kartu kelompok tidak ditemukan.";
      cardId = groupCard.id;
    }

    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    const payload = {
      warga_id: wargaId,
      bulan: existing?.bulan || new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(now),
      tanggal_bayar: existing?.tanggal_bayar || localDate,
      nominal: amount,
      keterangan: existing?.keterangan?.trim() || INITIAL_IURAN_NOTE,
      kartu_id: cardId,
      petugas_id: profile?.id ?? null,
    };
    if (existing) {
      const { data, error } = await supabase.from("iuran").update(payload).eq("id", existing.id).select("id,nominal,kartu_id").maybeSingle();
      if (error) return error.message;
      if (!data) return "Transaksi iuran awal tidak ditemukan atau tidak dapat diperbarui.";
      if (Number(data.nominal) !== amount) return "Nominal yang tersimpan tidak sesuai dengan input.";
      return null;
    }
    const { data, error } = await supabase.from("iuran").insert(payload).select("id,nominal,kartu_id").single();
    if (error) return error.message;
    if (!data) return "Transaksi iuran awal tidak dikembalikan oleh database setelah disimpan.";
    if (Number(data.nominal) !== amount) return "Nominal yang tersimpan tidak sesuai dengan input.";
    return null;
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
    event.preventDefault(); if (!supabase || isSavingRef.current) return; setError(null); setNotice(null); if (!nama.trim() || !selectedGroups.length) { setError("Nama anggota dan minimal satu kelompok wajib diisi."); return; }
    const submittedAmount = String(new FormData(event.currentTarget).get("iuranAwal") ?? "").trim();
    const initialAmount = submittedAmount ? Number(submittedAmount) : Number.NaN;
    if (!Number.isFinite(initialAmount) || initialAmount < 0) { setError("Nominal iuran awal harus berupa angka nol atau lebih."); return; }
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      window.sessionStorage.setItem("kas-bendungan-member-save-pending", "true");
      if (!editing) {
        const password = window.prompt("Masukkan password login untuk mengonfirmasi penambahan anggota:");
        if (!password || !user?.email) { setError("Sesi login tidak tersedia."); return; }
        const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password });
        if (authError) { setError("Password salah. Anggota tidak ditambahkan."); return; }
      }
      const kelompokUtama = groups.find((group) => group.id === selectedGroups[0])?.nama || "";
      const payload = { nama: nama.trim(), kelompok: kelompokUtama, nik_kk: nikKk.trim() || null, nik_ktp: nikKtp.trim() || null, nomor_telepon: nomorTelepon.trim() || null };
      let wargaId: number;
      if (editing) {
        const { error: updateError } = await supabase.from("warga").update(payload).eq("id", editing.id);
        if (updateError) { setError(updateError.message); return; }
        wargaId = editing.id;
      } else {
        const { data, error: insertError } = await supabase.from("warga").insert(payload).select("id").single();
        if (insertError || !data) { setError(insertError?.message || "Gagal menyimpan anggota."); return; }
        wargaId = Number(data.id);
      }
      const groupError = await saveGroups(wargaId);
      if (groupError) { setError(groupError.message); return; }
      await ensureMemberCards();
      const iuranError = await saveInitialIuran(wargaId, initialAmount, kelompokUtama);
      if (iuranError) { setError(`Anggota tersimpan, tetapi iuran awal gagal disimpan: ${iuranError}`); await loadWarga(); return; }
      resetForm();
      await Promise.all([loadWarga(), loadGroups()]);
      setNotice(initialAmount > 0 ? `Iuran awal ${money(initialAmount)} tersimpan dan masuk ke saldo kas.` : "Anggota tersimpan dengan iuran awal Rp0; saldo kas tidak bertambah.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Terjadi kesalahan saat menyimpan anggota dan iuran.");
    } finally {
      try { window.sessionStorage.removeItem("kas-bendungan-member-save-pending"); } catch {}
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const totalIuranSemuaAnggota = items.reduce((sum, item) => sum + (totals[item.id] ?? 0), 0);
  const sortedItems = useMemo(() => [...(groupFilter ? items.filter((item) => (item.warga_kelompok || []).some((membership) => groups.find((group) => group.id === membership.kelompok_id)?.nama === groupFilter)) : items)].sort((a, b) => {
    const groupName = (item: Warga) => (item.warga_kelompok || []).map((membership) => groups.find((group) => group.id === membership.kelompok_id)?.nama).filter(Boolean).join(", ") || item.kelompok || "";
    const value = (item: Warga) => sortKey === "total_iuran" ? (totals[item.id] ?? 0) : sortKey === "kelompok" ? groupName(item) : String(item[sortKey] ?? "");
    const left = value(a); const right = value(b);
    const result = sortKey === "created_at" ? String(left).localeCompare(String(right)) : typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "id", { sensitivity: "base" });
    const stableResult = result || a.id - b.id;
    return sortAsc ? stableResult : -stableResult;
  }), [groupFilter, groups, items, sortAsc, sortKey, totals]);
  const toggleSort = (key: typeof sortKey) => { if (sortKey === key) setSortAsc((value) => !value); else { setSortKey(key); setSortAsc(key === "nama" || key === "created_at"); } };
  const sortLabel = (key: typeof sortKey) => sortKey === key ? (sortAsc ? " ↑" : " ↓") : " ↕";

  const startAdd = () => {
    if (showForm && !editing) { setShowForm(false); return; }
    setEditing(null); setNama(""); setNikKk(""); setNikKtp(""); setNomorTelepon(""); setIuranAwal(""); setSelectedGroups([]); setNotice(null); setShowForm(true);
  };
  const startEdit = (item: Warga) => {
    const memberGroups = (item.warga_kelompok || []).map((membership) => membership.kelompok_id);
    const primaryGroupId = groups.find((group) => group.nama === item.kelompok)?.id;
    const orderedGroups = primaryGroupId ? [primaryGroupId, ...memberGroups.filter((id) => id !== primaryGroupId)] : memberGroups;
    setEditing(item); setNama(item.nama); setNikKk(item.nik_kk || ""); setNikKtp(item.nik_ktp || ""); setNomorTelepon(item.nomor_telepon || ""); setIuranAwal(String(initialIurans[item.id]?.nominal ?? 0)); setSelectedGroups(orderedGroups); setShowForm(true);
  };
  const groupChecklist = <fieldset className="grid gap-2 sm:grid-cols-3"><legend className="mb-1 text-sm font-medium text-zinc-700">Kelompok <span className="text-xs font-normal text-zinc-500">(pilih satu atau lebih)</span></legend>{groups.map((group) => <label key={group.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2"><input type="checkbox" checked={selectedGroups.includes(group.id)} onChange={() => toggleGroup(group.id)} /><span className="whitespace-nowrap">{group.nama}</span></label>)}</fieldset>;

  return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Data Anggota{groupFilter ? ` - ${groupFilter}` : ""}</h1><p className="text-sm text-zinc-600">{groupFilter ? `Menampilkan anggota yang mengikuti kelompok ${groupFilter} saja.` : "Satu anggota dapat mengikuti beberapa kelompok sekaligus."}</p></div>{canEdit && <button type="button" onClick={startAdd} className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-[.98]">{showForm && !editing ? "Tutup Form" : "+ Tambah Anggota"}</button>}</div>
    {canEdit && showForm && <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-3">
      <input required value={nama} onChange={(event) => setNama(event.target.value)} placeholder="Nama anggota *" className="rounded-lg border border-zinc-300 px-3 py-2" />
      {groupChecklist}
      <div className="grid content-start gap-1">
        <label htmlFor="initial-dues" className="text-sm font-medium text-zinc-700">Iuran awal (Rp)</label>
        <input id="initial-dues" name="iuranAwal" type="number" min="0" step="1" inputMode="numeric" required value={iuranAwal} onChange={(event) => setIuranAwal(event.target.value)} placeholder="Masukkan nominal (0 jika tidak ada)" className="rounded-lg border border-zinc-300 px-3 py-2" />
        <p className="text-xs text-zinc-500">Wajib diisi: transaksi iuran pertama anggota. Untuk anggota baru, dicatat pada bulan ini ke kelompok utama.</p>
      </div>
      <input value={nomorTelepon} onChange={(event) => setNomorTelepon(event.target.value)} placeholder="No. HP (opsional)" className="rounded-lg border border-zinc-300 px-3 py-2" />
      <input value={nikKtp} onChange={(event) => setNikKtp(event.target.value)} placeholder="NIK KTP (opsional)" className="rounded-lg border border-zinc-300 px-3 py-2" />
      <input value={nikKk} onChange={(event) => setNikKk(event.target.value)} placeholder="NIK KK (opsional)" className="rounded-lg border border-zinc-300 px-3 py-2" />
      <div className="flex gap-2"><button disabled={isSaving} className={`rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60`} type="submit">{isSaving ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Simpan Anggota"}</button>{editing && <button disabled={isSaving} className="rounded-lg border border-zinc-300 px-3 py-2 disabled:opacity-60" type="button" onClick={resetForm}>Batal</button>}</div>
    </form>}
    {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
    <div className="max-h-[min(68vh,720px)] overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <table className="min-w-[1380px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-zinc-100 text-zinc-700">
          <tr>
            <th className="whitespace-nowrap px-4 py-3">No</th>
            {([ ["nama", "Nama"], ["total_iuran", "Total Iuran"], ["kelompok", "Kelompok"] ] as const).map(([key, label]) => <th key={key} className="whitespace-nowrap px-4 py-3"><button type="button" onClick={() => toggleSort(key)} className="font-semibold hover:text-emerald-700">{label}{sortLabel(key)}</button></th>)}
            <th className="whitespace-nowrap px-4 py-3">Alamat</th>
            {([ ["nik_ktp", "NIK KTP"], ["nik_kk", "NIK KK"], ["nomor_telepon", "No. HP"], ["created_at", "Tanggal Gabung"] ] as const).map(([key, label]) => <th key={key} className="whitespace-nowrap px-4 py-3"><button type="button" onClick={() => toggleSort(key)} className="font-semibold hover:text-emerald-700">{label}{sortLabel(key)}</button></th>)}
            <th className="whitespace-nowrap px-4 py-3">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((item, index) => (
            <tr key={item.id} className="border-t border-zinc-200 align-top">
              <td className="whitespace-nowrap px-4 py-3">{index + 1}</td>
              <td className="whitespace-nowrap px-4 py-3 font-medium">{isGuest ? maskName(item.nama) : item.nama}</td>
              <td className="whitespace-nowrap px-4 py-3">{money(totals[item.id] ?? 0)}</td>
              <td className="whitespace-nowrap px-4 py-3">{(item.warga_kelompok || []).map((membership) => groups.find((group) => group.id === membership.kelompok_id)?.nama).filter(Boolean).join(", ") || item.kelompok || "-"}</td>
              <td className="px-4 py-3">{isGuest ? maskAddress(item.alamat_rt) : (item.alamat_rt || "-")}</td>
              <td className="whitespace-nowrap px-4 py-3">{isRestricted ? maskFixed(item.nik_ktp, 6) : (item.nik_ktp || "-")}</td>
              <td className="whitespace-nowrap px-4 py-3">{isRestricted ? maskFixed(item.nik_kk, 6) : (item.nik_kk || "-")}</td>
              <td className="whitespace-nowrap px-4 py-3">{isRestricted ? maskPhone(item.nomor_telepon) : (item.nomor_telepon || "-")}</td>
              <td className="whitespace-nowrap px-4 py-3">{item.created_at ? formatAddedDate(item.created_at) : "-"}</td>
              <td className="whitespace-nowrap px-4 py-3"><div className="flex gap-2">{canEdit && <button className="rounded border border-zinc-300 px-2 py-1" type="button" onClick={() => startEdit(item)}>Edit</button>}{canEdit && <button className="rounded border border-red-300 px-2 py-1 text-red-700" type="button" onClick={() => void deleteMember(item)}>Hapus</button>}</div></td>
            </tr>
          ))}
          {sortedItems.length === 0 ? <tr><td colSpan={10} className="px-4 py-6 text-center text-zinc-500">Belum ada data anggota{groupFilter ? ` di ${groupFilter}` : ""}.</td></tr> : null}
        </tbody>
      </table>
    </div>
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <span className="font-medium text-zinc-700">Total iuran semua anggota</span>
      <strong className="text-lg text-zinc-900">{money(totalIuranSemuaAnggota)}</strong>
    </div>
  </section>;
}
