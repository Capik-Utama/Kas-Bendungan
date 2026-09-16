"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatRupiah } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

type RiwayatItem = {
  id: string;
  nama: string;
  tipe: "MASUK" | "KELUAR";
  tanggal: string;
  nominal: number;
  sumber: string;
  keterangan: string;
};

type RelatedWarga = { nama: string } | { nama: string }[] | null;

function namaWarga(value: RelatedWarga) {
  return Array.isArray(value) ? value[0]?.nama ?? "" : value?.nama ?? "";
}

function formatTanggal(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatNamaFile(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "seluruh-periode";
}

export default function RiwayatPage() {
  const searchParams = useSearchParams();
  const { profile, isGuest } = useAuth();
  const isReadOnly = isGuest || profile?.role === "anggota";
  const scopedKartuId = Number(searchParams.get("kartu_id") || 0);
  const [items, setItems] = useState<RiwayatItem[]>([]);
  const [sortKey, setSortKey] = useState<"nama" | "tipe" | "tanggal" | "nominal" | "sumber" | "keterangan">("tanggal");
  const [sortAsc, setSortAsc] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [exportChoice, setExportChoice] = useState<"pdf" | "excel">("pdf");
  const [exporting, setExporting] = useState(false);
  const [groupName, setGroupName] = useState("Semua Kelompok");
  const [error, setError] = useState<string | null>(supabase ? null : "Supabase belum dikonfigurasi.");

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const loadHistory = async () => {
      const [iuranResult, pengeluaranResult, groupResult] = await Promise.all([
        client.from("iuran").select("id, tanggal_bayar, nominal, bulan, keterangan, kartu_id, warga:warga_id(nama)"),
        client.from("pengeluaran").select("id, tanggal, nominal, keperluan, keterangan, kartu_id"),
        scopedKartuId ? client.from("kartu_kas").select("nama").eq("id", scopedKartuId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      if (iuranResult.error || pengeluaranResult.error || groupResult.error) { setError(iuranResult.error?.message ?? pengeluaranResult.error?.message ?? groupResult.error?.message ?? "Gagal memuat laporan"); return; }
      setGroupName(groupResult.data?.nama ? String(groupResult.data.nama) : "Semua Kelompok");
      const iuranItems: RiwayatItem[] = (iuranResult.data ?? []).filter((item) => !scopedKartuId || item.kartu_id === scopedKartuId).map((item) => ({
        id: `iuran-${item.id}`, nama: namaWarga(item.warga as RelatedWarga), tipe: "MASUK", tanggal: item.tanggal_bayar,
        nominal: Number(item.nominal ?? 0), sumber: "Iuran", keterangan: item.keterangan || item.bulan || "-",
      }));
      const pengeluaranItems: RiwayatItem[] = (pengeluaranResult.data ?? []).filter((item) => !scopedKartuId || item.kartu_id === scopedKartuId).map((item) => ({
        id: `pengeluaran-${item.id}`, nama: "", tipe: "KELUAR", tanggal: item.tanggal, nominal: Number(item.nominal ?? 0),
        sumber: item.keperluan || "Pengeluaran", keterangan: item.keterangan || "-",
      }));
      setItems([...iuranItems, ...pengeluaranItems]);
      setError(null);
    };
    const timeout = setTimeout(() => void loadHistory(), 0);
    const channel = client.channel("riwayat-kas").on("postgres_changes", { event: "*", schema: "public", table: "iuran" }, () => void loadHistory()).on("postgres_changes", { event: "*", schema: "public", table: "pengeluaran" }, () => void loadHistory()).subscribe();
    return () => { clearTimeout(timeout); void client.removeChannel(channel); };
  }, [scopedKartuId]);

  const filteredItems = useMemo(() => items.filter((item) => (!startDate || item.tanggal >= startDate) && (!endDate || item.tanggal <= endDate)), [items, startDate, endDate]);
  const sortedItems = useMemo(() => [...filteredItems].sort((a, b) => {
    const left = sortKey === "nominal" ? a.nominal : a[sortKey];
    const right = sortKey === "nominal" ? b.nominal : b[sortKey];
    const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "id", { sensitivity: "base" });
    return sortAsc ? result : -result;
  }), [filteredItems, sortKey, sortAsc]);
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleItems = sortedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalIncome = filteredItems.filter((item) => item.tipe === "MASUK").reduce((sum, item) => sum + item.nominal, 0);
  const totalExpense = filteredItems.filter((item) => item.tipe === "KELUAR").reduce((sum, item) => sum + item.nominal, 0);
  const finalBalance = totalIncome - totalExpense;
  const periodLabel = startDate || endDate ? `${startDate ? formatTanggal(startDate) : "Awal"} – ${endDate ? formatTanggal(endDate) : "Sekarang"}` : "Seluruh periode";
  const reportTitle = `Laporan Transaksi ${groupName}`;
  const toggleSort = (key: typeof sortKey) => { if (sortKey === key) setSortAsc((value) => !value); else { setSortKey(key); setSortAsc(key === "nama" || key === "sumber" || key === "keterangan"); } };
  const sortLabel = (key: typeof sortKey) => sortKey === key ? (sortAsc ? " ↑" : " ↓") : " ↕";
  const changePageSize = (value: number) => { setPageSize(value); setPage(1); };

  function printReport() {
    window.document.title = `${reportTitle} - ${formatNamaFile(periodLabel)}`;
    window.print();
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rows = filteredItems.map((item, index) => [index + 1, item.nama || "-", item.tipe, item.tanggal, item.nominal, item.sumber, item.keterangan]);
      const sheet = XLSX.utils.aoa_to_sheet([
        [reportTitle.toUpperCase()],
        ["Periode", periodLabel],
        ["Jumlah transaksi", filteredItems.length],
        ["Total pemasukan", totalIncome],
        ["Total pengeluaran", totalExpense],
        ["Kas akhir", finalBalance],
        [],
        ["No", "Nama (jika iuran)", "Tipe", "Tanggal", "Nominal", "Sumber/Keperluan", "Keterangan"],
        ...rows,
      ]);
      sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
      sheet["!cols"] = [{ wch: 6 }, { wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 24 }, { wch: 32 }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Laporan Kas");
      XLSX.writeFile(workbook, `${formatNamaFile(reportTitle)}-${formatNamaFile(periodLabel)}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  function handleExport() {
    if (isReadOnly) return;
    if (profile?.role === "developer" && exportChoice === "excel") { void exportExcel(); return; }
    printReport();
  }

  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">Laporan Transaksi</h1><p className="text-sm text-zinc-600">Seluruh riwayat pemasukan dan pengeluaran kas.</p></div><div className="flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"><label className="grid gap-1 text-xs font-medium text-zinc-600">Dari<input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-800" /></label><label className="grid gap-1 text-xs font-medium text-zinc-600">Sampai<input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-800" /></label><button type="button" onClick={() => { setStartDate(""); setEndDate(""); setPage(1); }} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">Semua periode</button></div></div>
    {!isReadOnly && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 print:hidden"><div><p className="font-semibold text-emerald-900">Download laporan</p><p className="text-xs text-emerald-700">Mengekspor data sesuai periode yang dipilih ({filteredItems.length} transaksi).</p></div><div className="flex items-center gap-2">{profile?.role === "developer" && <select aria-label="Format laporan" value={exportChoice} onChange={(event) => setExportChoice(event.target.value as "pdf" | "excel")} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-zinc-800"><option value="pdf">PDF / Cetak</option><option value="excel">Excel (.xlsx)</option></select>}<button type="button" onClick={handleExport} disabled={exporting} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60">{exporting ? "Menyiapkan..." : "Download laporan"}</button></div></div>}
    {error ? <p className="text-sm text-red-600">{error}</p> : null}
    <div className="report-print-header hidden"><h1>{reportTitle}</h1><p>Periode: {periodLabel}</p><p>Dibuat: {new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short" }).format(new Date())}</p></div>
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm"><table className="min-w-[980px] text-left text-sm"><thead className="bg-zinc-100 text-zinc-700"><tr>{([ ["nama", "Nama (jika iuran)"], ["tipe", "Tipe"], ["tanggal", "Tanggal"], ["nominal", "Nominal"], ["sumber", "Sumber/Keperluan"], ["keterangan", "Keterangan"] ] as const).map(([key, label]) => <th key={key} className="whitespace-nowrap px-4 py-3"><button type="button" onClick={() => toggleSort(key)} className="font-semibold hover:text-emerald-700 print:pointer-events-none">{label}{sortLabel(key)}</button></th>)}</tr></thead><tbody>{visibleItems.map((item) => <tr key={item.id} className="border-t border-zinc-200 align-top"><td className="whitespace-nowrap px-4 py-3">{item.nama || "-"}</td><td className="whitespace-nowrap px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.tipe === "MASUK" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{item.tipe}</span></td><td className="whitespace-nowrap px-4 py-3">{formatTanggal(item.tanggal)}</td><td className="whitespace-nowrap px-4 py-3">{formatRupiah(item.nominal)}</td><td className="whitespace-nowrap px-4 py-3">{item.sumber}</td><td className="px-4 py-3">{item.keterangan}</td></tr>)}{visibleItems.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">Belum ada transaksi pada periode ini.</td></tr>}</tbody></table></div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm print:hidden"><span className="text-sm text-zinc-600">Menampilkan {visibleItems.length ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, sortedItems.length)} dari {sortedItems.length} transaksi</span><div className="flex items-center gap-2"><label className="text-sm text-zinc-600">Baris per halaman<select value={pageSize} onChange={(event) => changePageSize(Number(event.target.value))} className="ml-2 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-800"><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><div className="flex gap-1"><button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40">‹</button>{Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => <button key={number} type="button" onClick={() => setPage(number)} className={`rounded-lg border px-3 py-1.5 text-sm ${number === currentPage ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300"}`}>{number}</button>)}<button type="button" disabled={currentPage === totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40">›</button></div></div></div>
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><h2 className="mb-3 text-lg font-semibold">Rincian Laporan</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl bg-zinc-50 p-3"><p className="text-sm text-zinc-500">Periode</p><strong className="block text-sm">{periodLabel}</strong></div><div className="rounded-xl bg-emerald-50 p-3"><p className="text-sm text-emerald-700">Total pemasukan</p><strong className="block text-lg text-emerald-800">{formatRupiah(totalIncome)}</strong></div><div className="rounded-xl bg-rose-50 p-3"><p className="text-sm text-rose-700">Total pengeluaran</p><strong className="block text-lg text-rose-800">{formatRupiah(totalExpense)}</strong></div><div className="rounded-xl bg-sky-50 p-3"><p className="text-sm text-sky-700">Kas akhir</p><strong className="block text-lg text-sky-800">{formatRupiah(finalBalance)}</strong></div></div></section>
  </section>;
}
