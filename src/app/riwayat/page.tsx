"use client";

import { useEffect, useState } from "react";
import { formatRupiah } from "@/lib/format";
import { supabase } from "@/lib/supabase";

type RiwayatItem = {
  id: string;
  tanggal: string;
  tipe: "MASUK" | "KELUAR";
  sumber: string;
  nominal: number;
  keterangan: string;
};

export default function RiwayatPage() {
  const [items, setItems] = useState<RiwayatItem[]>([]);
  const [error, setError] = useState<string | null>(
    supabase ? null : "Supabase belum dikonfigurasi.",
  );

  useEffect(() => {
    const client = supabase;
    if (!client) {
      return;
    }

    const loadHistory = async () => {
      const [iuranResult, pengeluaranResult] = await Promise.all([
        client
          .from("iuran")
          .select("id, tanggal_bayar, nominal, bulan, keterangan, warga:warga_id(nama)"),
        client.from("pengeluaran").select("id, tanggal, nominal, keperluan, keterangan"),
      ]);

      if (iuranResult.error || pengeluaranResult.error) {
        setError(iuranResult.error?.message ?? pengeluaranResult.error?.message ?? "Gagal memuat riwayat");
        return;
      }

      const iuranItems: RiwayatItem[] = ((iuranResult.data ?? []) as Array<{
        id: number;
        tanggal_bayar: string;
        nominal: number;
        bulan: string;
        keterangan: string;
        warga: { nama: string } | { nama: string }[] | null;
      }>).map((item) => {
        const wargaNama = Array.isArray(item.warga)
          ? (item.warga[0]?.nama ?? null)
          : (item.warga?.nama ?? null);

        return {
          id: `iuran-${item.id}`,
          tanggal: item.tanggal_bayar,
          tipe: "MASUK",
          sumber: wargaNama ? `Iuran - ${wargaNama}` : "Iuran",
          nominal: Number(item.nominal ?? 0),
          keterangan: item.keterangan || item.bulan || "-",
        };
      });

      const pengeluaranItems: RiwayatItem[] = (pengeluaranResult.data ?? []).map((item) => ({
        id: `pengeluaran-${item.id}`,
        tanggal: item.tanggal,
        tipe: "KELUAR",
        sumber: item.keperluan,
        nominal: Number(item.nominal ?? 0),
        keterangan: item.keterangan || "-",
      }));

      const merged = [...iuranItems, ...pengeluaranItems].sort((a, b) =>
        b.tanggal.localeCompare(a.tanggal),
      );

      setItems(merged);
      setError(null);
    };

    const timeout = setTimeout(() => {
      void loadHistory();
    }, 0);

    const channel = client
      .channel("riwayat-kas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "iuran" },
        () => void loadHistory(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pengeluaran" },
        () => void loadHistory(),
      )
      .subscribe();

    return () => {
      clearTimeout(timeout);
      void client.removeChannel(channel);
    };
  }, []);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Transparansi / Riwayat Transaksi</h1>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-100 text-zinc-700">
            <tr>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3">Tipe</th>
              <th className="px-4 py-3">Sumber/Keperluan</th>
              <th className="px-4 py-3">Nominal</th>
              <th className="px-4 py-3">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-zinc-200">
                <td className="px-4 py-3">{item.tanggal}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.tipe === "MASUK"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {item.tipe}
                  </span>
                </td>
                <td className="px-4 py-3">{item.sumber}</td>
                <td className="px-4 py-3">{formatRupiah(item.nominal)}</td>
                <td className="px-4 py-3">{item.keterangan}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                  Belum ada transaksi.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
