"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatRupiah } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

type PengeluaranItem = {
  id: number;
  tanggal: string;
  keperluan: string;
  nominal: number;
  keterangan: string;
};
type GroupCard = { id: number; nama: string };

export default function PengeluaranPage() {
  const { canEdit } = useAuth();
  const searchParams = useSearchParams();
  const scopedKartuId = Number(searchParams.get("kartu_id") || 0);
  const [items, setItems] = useState<PengeluaranItem[]>([]);
  const [tanggal, setTanggal] = useState("");
  const [keperluan, setKeperluan] = useState("");
  const [nominal, setNominal] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [groupCards, setGroupCards] = useState<GroupCard[]>([]);
  const [kartuId, setKartuId] = useState(scopedKartuId ? String(scopedKartuId) : "");
  const [sortKey, setSortKey] = useState<"tanggal" | "keperluan" | "nominal" | "keterangan">("tanggal");
  const [sortAsc, setSortAsc] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(
    supabase ? null : "Supabase belum dikonfigurasi.",
  );

  const loadData = async () => {
    if (!supabase) return;

    const [{ data, error: loadError }, cardsResult] = await Promise.all([
      supabase.from("pengeluaran").select("id, tanggal, keperluan, nominal, keterangan, kartu_id").order("tanggal", { ascending: false }),
      supabase.from("kartu_kas").select("id, nama").eq("kategori", "Kelompok").order("nama"),
    ]);

    if (loadError || cardsResult.error) {
      setError(loadError?.message ?? cardsResult.error?.message ?? "Gagal memuat data pengeluaran");
      return;
    }

    setItems(((data as (PengeluaranItem & { kartu_id: number | null })[]) ?? []).filter((item) => !scopedKartuId || item.kartu_id === scopedKartuId));
    setGroupCards(scopedKartuId ? ((cardsResult.data as GroupCard[]) ?? []).filter((card) => card.id === scopedKartuId) : (cardsResult.data as GroupCard[]) ?? []);
    setError(null);
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadData();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  const sortedItems = useMemo(() => [...items].sort((a, b) => {
    const left = sortKey === "nominal" ? Number(a.nominal ?? 0) : String(a[sortKey] ?? "");
    const right = sortKey === "nominal" ? Number(b.nominal ?? 0) : String(b[sortKey] ?? "");
    const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "id");
    return sortAsc ? result : -result;
  }), [items, sortKey, sortAsc]);
  const toggleSort = (key: typeof sortKey) => { if (sortKey === key) setSortAsc((value) => !value); else { setSortKey(key); setSortAsc(false); } };
  const sortLabel = (key: typeof sortKey) => sortKey === key ? (sortAsc ? " ↑" : " ↓") : " ↕";

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!supabase) {
      return;
    }

    if (!kartuId) { setError("Pilih kelompok tujuan transaksi."); return; }

    const { error: insertError } = await supabase.from("pengeluaran").insert({
      tanggal,
      keperluan,
      nominal: Number(nominal),
      keterangan,
      kartu_id: Number(kartuId),
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }
    const { data: existing } = await supabase.from("kartu_kas").select("id").eq("parent_id", Number(kartuId)).eq("kategori", "Pengeluaran").limit(1);
    if (!existing?.length) await supabase.from("kartu_kas").insert({ parent_id: Number(kartuId), kategori: "Pengeluaran", nama: "Pengeluaran", catatan: "Pengeluaran dari transaksi kas", nominal: 0, ikon: "↘" });

    setTanggal("");
    setKeperluan("");
    setNominal("");
    setKeterangan("");
    setKartuId("");
    await loadData();
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Pencatatan Pengeluaran Kas</h1><p className="text-sm text-zinc-600">Kelola seluruh pengeluaran kas berdasarkan kelompok.</p></div>{canEdit && <button type="button" onClick={() => setShowForm((current) => !current)} className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-[.98]">{showForm ? "Tutup Form" : "+ Tambah Pengeluaran"}</button>}</div>

      {canEdit && showForm && <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <select required value={kartuId} onChange={(event) => setKartuId(event.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2"><option value="">Pilih kelompok tujuan</option>{groupCards.map((card) => <option key={card.id} value={card.id}>{card.nama}</option>)}</select>
        <input
          required
          type="date"
          value={tanggal}
          onChange={(event) => setTanggal(event.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2"
        />
        <input
          required
          value={keperluan}
          onChange={(event) => setKeperluan(event.target.value)}
          placeholder="Keperluan kampung"
          className="rounded-lg border border-zinc-300 px-3 py-2"
        />
        <input
          required
          type="number"
          min={0}
          value={nominal}
          onChange={(event) => setNominal(event.target.value)}
          placeholder="Nominal"
          className="rounded-lg border border-zinc-300 px-3 py-2"
        />
        <input
          value={keterangan}
          onChange={(event) => setKeterangan(event.target.value)}
          placeholder="Keterangan"
          className="rounded-lg border border-zinc-300 px-3 py-2"
        />
        <button className="rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-700 md:col-span-4" type="submit">
          Simpan Pengeluaran
        </button>
      </form>}

      {!canEdit && <p className="read-only-note">Mode lihat saja: akun anggota tidak dapat menambah data.</p>}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="max-h-[min(68vh,720px)] overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-[620px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-100 text-zinc-700">
            <tr>
              {([ ["tanggal", "Tanggal"], ["keperluan", "Keperluan"], ["nominal", "Nominal"], ["keterangan", "Keterangan"] ] as const).map(([key, label]) => <th key={key} className="whitespace-nowrap px-4 py-3"><button type="button" onClick={() => toggleSort(key)} className="font-semibold hover:text-emerald-700">{label}{sortLabel(key)}</button></th>)}
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => (
              <tr key={item.id} className="border-t border-zinc-200">
                <td className="whitespace-nowrap px-4 py-3">{item.tanggal}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatRupiah(Number(item.nominal ?? 0))}</td>
                <td className="px-4 py-3">{item.keterangan || item.keperluan || "-"}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-zinc-500">
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
