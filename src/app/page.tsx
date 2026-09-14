"use client";

import { useEffect, useState } from "react";
import { formatRupiah } from "@/lib/format";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Summary = {
  totalIuran: number;
  totalPengeluaran: number;
  totalSaldo: number;
};

const initialSummary: Summary = {
  totalIuran: 0,
  totalPengeluaran: 0,
  totalSaldo: 0,
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary>(initialSummary);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(
    isSupabaseConfigured
      ? null
      : "Supabase belum dikonfigurasi. Isi variabel di .env.local terlebih dahulu.",
  );

  useEffect(() => {
    const client = supabase;
    if (!client) {
      return;
    }

    const fetchSummary = async () => {
      setLoading(true);
      setError(null);

      const [iuranResult, pengeluaranResult] = await Promise.all([
        client.from("iuran").select("nominal"),
        client.from("pengeluaran").select("nominal"),
      ]);

      if (iuranResult.error || pengeluaranResult.error) {
        setError(
          iuranResult.error?.message ?? pengeluaranResult.error?.message ?? "Gagal memuat dashboard",
        );
        setLoading(false);
        return;
      }

      const totalIuran = (iuranResult.data ?? []).reduce(
        (sum, row) => sum + Number(row.nominal ?? 0),
        0,
      );
      const totalPengeluaran = (pengeluaranResult.data ?? []).reduce(
        (sum, row) => sum + Number(row.nominal ?? 0),
        0,
      );

      setSummary({
        totalIuran,
        totalPengeluaran,
        totalSaldo: totalIuran - totalPengeluaran,
      });
      setLoading(false);
    };

    const timeout = setTimeout(() => {
      void fetchSummary();
    }, 0);

    const channel = client
      .channel("dashboard-kas-summary")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "iuran" },
        () => void fetchSummary(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pengeluaran" },
        () => void fetchSummary(),
      )
      .subscribe();

    return () => {
      clearTimeout(timeout);
      void client.removeChannel(channel);
    };
  }, []);

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold">Dashboard Kas Kampung</h1>
        <p className="text-sm text-zinc-600">Ringkasan kas secara real-time untuk seluruh warga.</p>
      </div>

      {!isSupabaseConfigured || error ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Total Saldo Kas" value={loading ? "Memuat..." : formatRupiah(summary.totalSaldo)} />
        <Card title="Total Pemasukan Iuran" value={loading ? "Memuat..." : formatRupiah(summary.totalIuran)} />
        <Card
          title="Total Pengeluaran"
          value={loading ? "Memuat..." : formatRupiah(summary.totalPengeluaran)}
        />
      </div>
    </section>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </article>
  );
}
