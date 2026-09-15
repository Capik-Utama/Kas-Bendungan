"use client";

import { FormEvent, useEffect, useState } from "react";
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
      <h1 className="text-2xl font-semibold">Pencatatan Pengeluaran Kas</h1>

      {canEdit && <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-4">
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

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-100 text-zinc-700">
            <tr>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3">Keperluan</th>
              <th className="px-4 py-3">Nominal</th>
              <th className="px-4 py-3">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-zinc-200">
                <td className="px-4 py-3">{item.tanggal}</td>
                <td className="px-4 py-3">{item.keperluan}</td>
                <td className="px-4 py-3">{formatRupiah(Number(item.nominal ?? 0))}</td>
                <td className="px-4 py-3">{item.keterangan || "-"}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
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
