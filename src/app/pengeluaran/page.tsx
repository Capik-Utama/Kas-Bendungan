"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatRupiah } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

function formatTanggal(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function tanggalHariIni() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

type ExpensePurpose = "Ke kelompok lain" | "Ke petugas lain" | "Kebutuhan kelompok";
type PengeluaranItem = {
  id: number;
  tanggal: string;
  keperluan: string;
  jenis_keperluan: ExpensePurpose;
  nominal: number;
  keterangan: string;
  kartu_id?: number | null;
  tujuan_kelompok_id?: number | null;
  tujuan_petugas_id?: string | null;
  tujuanKelompok?: { nama: string } | { nama: string }[] | null;
  tujuanPetugas?: { username: string } | { username: string }[] | null;
};
type GroupCard = { id: number; nama: string };
type GroupOption = { id: number; nama: string };
type Officer = { id: string; username: string; role: string; profile_kelompok?: { kelompok_id: number }[] };

export default function PengeluaranPage() {
  const { canEdit, profile } = useAuth();
  const searchParams = useSearchParams();
  const scopedKartuId = Number(searchParams.get("kartu_id") || 0);
  const [items, setItems] = useState<PengeluaranItem[]>([]);
  const [tanggal, setTanggal] = useState(tanggalHariIni);
  const [jenisKeperluan, setJenisKeperluan] = useState<ExpensePurpose>("Kebutuhan kelompok");
  const [tujuanKelompokId, setTujuanKelompokId] = useState("");
  const [tujuanPetugasId, setTujuanPetugasId] = useState("");
  const [keperluan, setKeperluan] = useState("");
  const [nominal, setNominal] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [groupCards, setGroupCards] = useState<GroupCard[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [allOfficers, setAllOfficers] = useState<Officer[]>([]);
  const [kartuId, setKartuId] = useState(scopedKartuId ? String(scopedKartuId) : "");
  const [sortKey, setSortKey] = useState<"tanggal" | "nominal" | "keterangan">("tanggal");
  const [sortAsc, setSortAsc] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PengeluaranItem | null>(null);
  const [error, setError] = useState<string | null>(
    supabase ? null : "Supabase belum dikonfigurasi.",
  );

  const loadData = async () => {
    if (!supabase) return;

    const [{ data, error: loadError }, cardsResult, groupsResult, officersResult] = await Promise.all([
      supabase.from("pengeluaran").select("id, tanggal, keperluan, jenis_keperluan, nominal, keterangan, kartu_id, tujuan_kelompok_id, tujuan_petugas_id, tujuanKelompok:tujuan_kelompok_id(nama), tujuanPetugas:tujuan_petugas_id(username)").order("tanggal", { ascending: false }),
      supabase.from("kartu_kas").select("id, nama").eq("kategori", "Kelompok").order("nama"),
      supabase.from("kelompok").select("id, nama").order("nama"),
      supabase.from("profiles").select("id, username, role, profile_kelompok(kelompok_id)").in("role", ["developer", "ketua", "bendahara"]).order("username"),
    ]);

    if (loadError || cardsResult.error || groupsResult.error || officersResult.error) {
      setError(loadError?.message ?? cardsResult.error?.message ?? groupsResult.error?.message ?? officersResult.error?.message ?? "Gagal memuat data pengeluaran");
      return;
    }

    setItems(((data as PengeluaranItem[]) ?? []).filter((item) => !scopedKartuId || item.kartu_id === scopedKartuId));
    const loadedCards = (cardsResult.data as GroupCard[]) ?? [];
    setGroupCards(scopedKartuId ? loadedCards.filter((card) => card.id === scopedKartuId) : loadedCards);
    setGroups((groupsResult.data as GroupOption[]) ?? []);
    const activeCardName = loadedCards.find((card) => card.id === scopedKartuId)?.nama;
    const activeGroupId = ((groupsResult.data as GroupOption[]) ?? []).find((group) => group.nama === activeCardName)?.id;
    const loadedOfficers = (officersResult.data as Officer[]) ?? [];
    setAllOfficers(loadedOfficers);
    setOfficers(scopedKartuId && activeGroupId
      ? loadedOfficers.filter((officer) => (officer.profile_kelompok ?? []).some((membership) => membership.kelompok_id === activeGroupId))
      : []);
    setError(null);
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadData();
    }, 0);

    return () => clearTimeout(timeout);
  }, [profile?.id, scopedKartuId]);

  const sortedItems = useMemo(() => [...items].sort((a, b) => {
    const left = sortKey === "nominal" ? Number(a.nominal ?? 0) : String(a[sortKey] ?? "");
    const right = sortKey === "nominal" ? Number(b.nominal ?? 0) : String(b[sortKey] ?? "");
    const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "id");
    return sortAsc ? result : -result;
  }), [items, sortKey, sortAsc]);
  const toggleSort = (key: typeof sortKey) => { if (sortKey === key) setSortAsc((value) => !value); else { setSortKey(key); setSortAsc(false); } };
  const sortLabel = (key: typeof sortKey) => sortKey === key ? (sortAsc ? " ↑" : " ↓") : " ↕";
  const resetForm = () => {
    setEditing(null);
    setTanggal(tanggalHariIni());
    setJenisKeperluan("Kebutuhan kelompok");
    setTujuanKelompokId("");
    setTujuanPetugasId("");
    setKeperluan("");
    setNominal("");
    setKeterangan("");
    setKartuId(scopedKartuId ? String(scopedKartuId) : "");
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!supabase) {
      return;
    }

    if (!scopedKartuId) { setError("Buka form pengeluaran dari kartu kelompok terlebih dahulu."); return; }
    if (jenisKeperluan === "Ke kelompok lain" && !tujuanKelompokId) { setError("Pilih kelompok tujuan."); return; }
    if (jenisKeperluan === "Ke petugas lain" && !tujuanPetugasId) { setError("Pilih petugas tujuan."); return; }
    const targetOfficers = jenisKeperluan === "Ke kelompok lain"
      ? allOfficers.filter((officer) => (officer.profile_kelompok ?? []).some((membership) => membership.kelompok_id === Number(tujuanKelompokId)))
      : officers;
    if ((jenisKeperluan === "Ke petugas lain" || jenisKeperluan === "Ke kelompok lain") && !targetOfficers.some((officer) => officer.id === tujuanPetugasId)) { setError("Petugas tujuan tidak terdaftar pada kelompok transaksi yang dipilih."); return; }

    const payload = {
      tanggal,
      keperluan: keperluan.trim() || jenisKeperluan,
      jenis_keperluan: jenisKeperluan,
      tujuan_kelompok_id: jenisKeperluan === "Ke kelompok lain" ? Number(tujuanKelompokId) : null,
      tujuan_petugas_id: jenisKeperluan === "Ke petugas lain" ? tujuanPetugasId : null,
      nominal: Number(nominal),
      keterangan,
      kartu_id: scopedKartuId,
      petugas_id: profile?.id ?? null,
    };
    const { error: insertError } = editing
      ? await supabase.from("pengeluaran").update(payload).eq("id", editing.id)
      : await supabase.from("pengeluaran").insert(payload);

    if (insertError) {
      setError(insertError.message);
      return;
    }
    if (!editing) {
      const { data: existing } = await supabase.from("kartu_kas").select("id").eq("parent_id", Number(kartuId)).eq("kategori", "Pengeluaran").limit(1);
      if (!existing?.length) await supabase.from("kartu_kas").insert({ parent_id: Number(kartuId), kategori: "Pengeluaran", nama: "Pengeluaran", catatan: "Pengeluaran dari transaksi kas", nominal: 0, ikon: "↘" });
    }

    resetForm();
    setShowForm(false);
    await loadData();
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Pencatatan Pengeluaran Kas</h1><p className="text-sm text-zinc-600">Kelola seluruh pengeluaran kas berdasarkan kelompok.</p></div>{canEdit && <button type="button" onClick={() => setShowForm((current) => !current)} className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-[.98]">{showForm ? "Tutup Form" : "+ Tambah Pengeluaran"}</button>}</div>

      {canEdit && showForm && <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <input required type="date" value={tanggal} onChange={(event) => setTanggal(event.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2" />
        <select required value={jenisKeperluan} onChange={(event) => { const next = event.target.value as ExpensePurpose; setJenisKeperluan(next); setTujuanKelompokId(""); setTujuanPetugasId(""); }} className="rounded-lg border border-zinc-300 px-3 py-2"><option value="Ke kelompok lain">Ke kelompok lain</option><option value="Ke petugas lain">Ke petugas lain</option><option value="Kebutuhan kelompok">Kebutuhan kelompok</option></select>
        {jenisKeperluan === "Ke kelompok lain" && <><select required value={tujuanKelompokId} onChange={(event) => { setTujuanKelompokId(event.target.value); setTujuanPetugasId(""); }} className="rounded-lg border border-zinc-300 px-3 py-2"><option value="">Pilih kelompok tujuan</option>{groups.filter((group) => group.nama !== groupCards.find((card) => card.id === Number(kartuId))?.nama).map((group) => <option key={group.id} value={group.id}>{group.nama}</option>)}</select><select required value={tujuanPetugasId} onChange={(event) => setTujuanPetugasId(event.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2"><option value="">{tujuanKelompokId ? "Pilih petugas tujuan" : "Pilih kelompok tujuan terlebih dahulu"}</option>{allOfficers.filter((officer) => (officer.profile_kelompok ?? []).some((membership) => membership.kelompok_id === Number(tujuanKelompokId))).map((officer) => <option key={officer.id} value={officer.id}>{officer.username}</option>)}</select></>}
        {jenisKeperluan === "Ke petugas lain" && <select required value={tujuanPetugasId} onChange={(event) => setTujuanPetugasId(event.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2"><option value="">Pilih petugas tujuan</option>{officers.filter((officer) => officer.id !== profile?.id).map((officer) => <option key={officer.id} value={officer.id}>{officer.username}</option>)}</select>}
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 md:col-span-2">Sumber transaksi: <strong>{groupCards.find((card) => card.id === scopedKartuId)?.nama || "Kelompok ini"}</strong></p>
        <input value={keterangan} onChange={(event) => setKeterangan(event.target.value)} placeholder="Keterangan" className="rounded-lg border border-zinc-300 px-3 py-2" />
        <input required type="number" min={0} value={nominal} onChange={(event) => setNominal(event.target.value)} placeholder="Nominal" className="rounded-lg border border-zinc-300 px-3 py-2" />
        <button className="rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-700 md:col-span-4" type="submit">
          {editing ? "Simpan Perubahan" : "Simpan Pengeluaran"}
        </button>
        {editing && <button type="button" className="rounded-lg border border-zinc-300 px-3 py-2 font-medium text-zinc-700 hover:bg-zinc-50 md:col-span-4" onClick={() => { resetForm(); setShowForm(false); setError(null); }}>Batal Edit</button>}
      </form>}

      {!canEdit && <p className="read-only-note">Mode lihat saja: akun anggota tidak dapat menambah data.</p>}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="max-h-[min(68vh,720px)] overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-[620px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-100 text-zinc-700">
            <tr>
              {([ ["tanggal", "Tanggal"], ["nominal", "Nominal"], ["keterangan", "Keterangan"] ] as const).map(([key, label]) => <th key={key} className="whitespace-nowrap px-4 py-3"><button type="button" onClick={() => toggleSort(key)} className="font-semibold hover:text-emerald-700">{label}{sortLabel(key)}</button></th>)}
            {canEdit && <th className="whitespace-nowrap px-4 py-3">Aksi</th>}</tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => (
              <tr key={item.id} className="border-t border-zinc-200">
                <td className="whitespace-nowrap px-4 py-3">{formatTanggal(item.tanggal)}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatRupiah(Number(item.nominal ?? 0))}</td>
                <td className="px-4 py-3">{item.keterangan || item.keperluan || "-"}</td>
                {canEdit && <td className="whitespace-nowrap px-4 py-3"><button type="button" className="mr-3 font-medium text-emerald-700 hover:underline" onClick={() => { setEditing(item); setTanggal(item.tanggal); setJenisKeperluan(item.jenis_keperluan || "Kebutuhan kelompok"); setTujuanKelompokId(String(item.tujuan_kelompok_id ?? "")); setTujuanPetugasId(item.tujuan_petugas_id ?? ""); setKeperluan(item.keperluan); setNominal(String(item.nominal)); setKeterangan(item.keterangan ?? ""); setKartuId(scopedKartuId ? String(scopedKartuId) : ""); setShowForm(true); setError(null); }}>Edit</button><button type="button" className="font-medium text-red-700 hover:underline" onClick={async () => { if (!window.confirm("Hapus catatan pengeluaran ini? Tindakan ini tidak dapat dibatalkan.")) return; const { error: deleteError } = await supabase!.from("pengeluaran").delete().eq("id", item.id); if (deleteError) setError(deleteError.message); else { if (editing?.id === item.id) resetForm(); await loadData(); } }}>Hapus</button></td>}
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 4 : 3} className="px-4 py-6 text-center text-zinc-500">
                  Belum ada data pengeluaran.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
