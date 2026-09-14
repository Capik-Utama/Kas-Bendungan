"use client";

import { FormEvent, useEffect, useState } from "react";
import { formatRupiah } from "@/lib/format";
import { supabase } from "@/lib/supabase";

type WargaOption = {
  id: number;
  nama: string;
};

type IuranItem = {
  id: number;
  bulan: string;
  nominal: number;
  tanggal_bayar: string;
  keterangan: string;
  warga: {
    nama: string;
  }[] | null;
};

export default function IuranPage() {
  const [warga, setWarga] = useState<WargaOption[]>([]);
  const [items, setItems] = useState<IuranItem[]>([]);
  const [wargaId, setWargaId] = useState("");
  const [bulan, setBulan] = useState("");
  const [nominal, setNominal] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [error, setError] = useState<string | null>(
    supabase ? null : "Supabase belum dikonfigurasi.",
  );

  const loadData = async () => {
    if (!supabase) return;

    const [wargaResult, iuranResult] = await Promise.all([
      supabase.from("warga").select("id, nama").order("nama", { ascending: true }),
      supabase
        .from("iuran")
        .select("id, bulan, nominal, tanggal_bayar, keterangan, warga:warga_id(nama)")
        .order("tanggal_bayar", { ascending: false }),
    ]);

    if (wargaResult.error || iuranResult.error) {
      setError(wargaResult.error?.message ?? iuranResult.error?.message ?? "Gagal memuat data iuran");
      return;
    }

    setWarga((wargaResult.data as WargaOption[]) ?? []);
    setItems((iuranResult.data as IuranItem[]) ?? []);
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

    const { error: insertError } = await supabase.from("iuran").insert({
      warga_id: Number(wargaId),
      bulan,
      nominal: Number(nominal),
      keterangan,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setWargaId("");
    setBulan("");
    setNominal("");
    setKeterangan("");
    await loadData();
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Pencatatan Iuran Warga</h1>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-4">
        <select
          required
          value={wargaId}
          onChange={(event) => setWargaId(event.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2"
        >
          <option value="">Pilih warga</option>
          {warga.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nama}
            </option>
          ))}
        </select>
        <input
          required
          value={bulan}
          onChange={(event) => setBulan(event.target.value)}
          placeholder="Bulan pembayaran (contoh: September 2026)"
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
          Simpan Pembayaran Iuran
        </button>
      </form>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-100 text-zinc-700">
            <tr>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3">Warga</th>
              <th className="px-4 py-3">Bulan</th>
              <th className="px-4 py-3">Nominal</th>
              <th className="px-4 py-3">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-zinc-200">
                <td className="px-4 py-3">{item.tanggal_bayar}</td>
                <td className="px-4 py-3">{item.warga?.[0]?.nama ?? "-"}</td>
                <td className="px-4 py-3">{item.bulan}</td>
                <td className="px-4 py-3">{formatRupiah(Number(item.nominal ?? 0))}</td>
                <td className="px-4 py-3">{item.keterangan || "-"}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                  Belum ada data iuran.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
