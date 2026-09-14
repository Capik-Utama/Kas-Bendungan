"use client";

import { FormEvent, useEffect, useState } from "react";
import { formatRupiah } from "@/lib/format";
import { supabase } from "@/lib/supabase";

type PengeluaranItem = {
  id: number;
  tanggal: string;
  keperluan: string;
  nominal: number;
  keterangan: string;
};

export default function PengeluaranPage() {
  const [items, setItems] = useState<PengeluaranItem[]>([]);
  const [tanggal, setTanggal] = useState("");
  const [keperluan, setKeperluan] = useState("");
  const [nominal, setNominal] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [error, setError] = useState<string | null>(
    supabase ? null : "Supabase belum dikonfigurasi.",
  );

  const loadData = async () => {
    if (!supabase) return;

    const { data, error: loadError } = await supabase
      .from("pengeluaran")
      .select("id, tanggal, keperluan, nominal, keterangan")
      .order("tanggal", { ascending: false });

    if (loadError) {
      setError(loadError.message);
      return;
    }

    setItems((data as PengeluaranItem[]) ?? []);
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

    const { error: insertError } = await supabase.from("pengeluaran").insert({
      tanggal,
      keperluan,
      nominal: Number(nominal),
      keterangan,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setTanggal("");
    setKeperluan("");
    setNominal("");
    setKeterangan("");
    await loadData();
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Pencatatan Pengeluaran Kas</h1>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-4">
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
      </form>

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
