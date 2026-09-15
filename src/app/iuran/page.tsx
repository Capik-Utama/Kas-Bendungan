"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatRupiah } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

type WargaOption = {
  id: number;
  nama: string;
  warga_kelompok?: { kelompok_id: number }[];
};

function formatTanggal(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

type IuranItem = {
  id: number;
  bulan: string;
  nominal: number;
  tanggal_bayar: string;
  keterangan: string;
  kartu_id: number | null;
  warga: {
    nama: string;
  } | {
    nama: string;
  }[] | null;
};
type GroupCard = { id: number; nama: string; kelompokId: number | null };
type Group = { id: number; nama: string };

export default function IuranPage() {
  const { canEdit } = useAuth();
  const searchParams = useSearchParams();
  const scopedKartuId = Number(searchParams.get("kartu_id") || 0);
  const [warga, setWarga] = useState<WargaOption[]>([]);
  const [items, setItems] = useState<IuranItem[]>([]);
  const [wargaId, setWargaId] = useState("");
  const [bulan, setBulan] = useState("");
  const [nominal, setNominal] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [groupCards, setGroupCards] = useState<GroupCard[]>([]);
  const [kartuId, setKartuId] = useState(scopedKartuId ? String(scopedKartuId) : "");
  const [sortKey, setSortKey] = useState<"warga" | "nominal" | "tanggal" | "keterangan">("tanggal");
  const [sortAsc, setSortAsc] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(
    supabase ? null : "Supabase belum dikonfigurasi.",
  );

  const selectedWarga = warga.find((item) => item.id === Number(wargaId));
  const selectedGroupIds = new Set((selectedWarga?.warga_kelompok ?? []).map((membership) => membership.kelompok_id));
  const availableGroupCards = selectedWarga
    ? groupCards.filter((card) => card.kelompokId !== null && selectedGroupIds.has(card.kelompokId))
    : groupCards;

  const loadData = async () => {
    if (!supabase) return;

    const [wargaResult, iuranResult, cardsResult, groupsResult] = await Promise.all([
      supabase.from("warga").select("id, nama, warga_kelompok(kelompok_id)").order("nama", { ascending: true }),
      supabase
        .from("iuran")
        .select("id, bulan, nominal, tanggal_bayar, keterangan, kartu_id, warga:warga_id(nama)")
        .order("tanggal_bayar", { ascending: false }),
      supabase.from("kartu_kas").select("id, nama").eq("kategori", "Kelompok").order("nama"),
      supabase.from("kelompok").select("id, nama").order("nama"),
    ]);

    if (wargaResult.error || iuranResult.error || cardsResult.error || groupsResult.error) {
      setError(wargaResult.error?.message ?? iuranResult.error?.message ?? cardsResult.error?.message ?? groupsResult.error?.message ?? "Gagal memuat data iuran");
      return;
    }

    setItems(((iuranResult.data as IuranItem[]) ?? []).filter((item) => !scopedKartuId || item.kartu_id === scopedKartuId));
    const groups = (groupsResult.data as Group[]) ?? [];
    const cards = (cardsResult.data ?? []).map((card) => ({
      id: Number(card.id),
      nama: card.nama,
      kelompokId: groups.find((group) => group.nama === card.nama)?.id ?? null,
    }));
    const scopedGroupId = cards.find((card) => card.id === scopedKartuId)?.kelompokId;
    const loadedWarga = (wargaResult.data as WargaOption[]) ?? [];
    setWarga(scopedGroupId ? loadedWarga.filter((item) => (item.warga_kelompok ?? []).some((membership) => membership.kelompok_id === scopedGroupId)) : loadedWarga);
    setGroupCards(scopedKartuId ? cards.filter((card) => card.id === scopedKartuId) : cards);
    setError(null);
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadData();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  const sortedItems = useMemo(() => [...items].sort((a, b) => {
    const wargaName = (item: IuranItem) => Array.isArray(item.warga) ? (item.warga[0]?.nama ?? "") : (item.warga?.nama ?? "");
    const left = sortKey === "warga" ? wargaName(a) : sortKey === "nominal" ? Number(a.nominal ?? 0) : sortKey === "tanggal" ? a.tanggal_bayar : String(a[sortKey] ?? "");
    const right = sortKey === "warga" ? wargaName(b) : sortKey === "nominal" ? Number(b.nominal ?? 0) : sortKey === "tanggal" ? b.tanggal_bayar : String(b[sortKey] ?? "");
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

    if (!wargaId) { setError("Pilih anggota terlebih dahulu."); return; }
    if (!kartuId) { setError("Pilih kelompok tujuan transaksi."); return; }
    if (selectedWarga && !availableGroupCards.some((card) => card.id === Number(kartuId))) {
      setError("Kelompok tujuan harus sesuai dengan kelompok yang diikuti anggota.");
      return;
    }

    const { error: insertError } = await supabase.from("iuran").insert({
      warga_id: Number(wargaId),
      bulan,
      nominal: Number(nominal),
      keterangan,
      kartu_id: Number(kartuId),
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    const { data: existing } = await supabase.from("kartu_kas").select("id").eq("parent_id", Number(kartuId)).eq("kategori", "Pemasukan").limit(1);
    if (!existing?.length) await supabase.from("kartu_kas").insert({ parent_id: Number(kartuId), kategori: "Pemasukan", nama: "Pemasukan", catatan: "Pemasukan dari transaksi warga", nominal: 0, ikon: "↗" });

    setWargaId("");
    setBulan("");
    setNominal("");
    setKeterangan("");
    setKartuId("");
    await loadData();
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Pencatatan Iuran Warga</h1><p className="text-sm text-zinc-600">Kelola pemasukan iuran berdasarkan kelompok.</p></div>{canEdit && <button type="button" onClick={() => setShowForm((current) => !current)} className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-[.98]">{showForm ? "Tutup Form" : "+ Tambah Pemasukan"}</button>}</div>

      {canEdit && showForm && <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <select
          required
          value={wargaId}
          onChange={(event) => { setWargaId(event.target.value); setKartuId(""); setError(null); }}
          className="rounded-lg border border-zinc-300 px-3 py-2"
        >
          <option value="">Pilih warga</option>
          {warga.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nama}
            </option>
          ))}
        </select>
        <select required value={kartuId} onChange={(event) => setKartuId(event.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2"><option value="">{selectedWarga ? (availableGroupCards.length ? "Pilih kelompok tujuan" : "Anggota belum memiliki kelompok") : "Pilih anggota terlebih dahulu"}</option>{availableGroupCards.map((card) => <option key={card.id} value={card.id}>{card.nama}</option>)}</select>
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
      </form>}

      {!canEdit && <p className="read-only-note">Mode lihat saja: akun anggota tidak dapat menambah data.</p>}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="max-h-[min(68vh,720px)] overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-[720px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-100 text-zinc-700">
            <tr>
              {([ ["warga", "Nama"], ["nominal", "Nominal"], ["tanggal", "Tanggal"], ["keterangan", "Keterangan"] ] as const).map(([key, label]) => <th key={key} className="whitespace-nowrap px-4 py-3"><button type="button" onClick={() => toggleSort(key)} className="font-semibold hover:text-emerald-700">{label}{sortLabel(key)}</button></th>)}
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => (
              <tr key={item.id} className="border-t border-zinc-200">
                <td className="whitespace-nowrap px-4 py-3">{Array.isArray(item.warga) ? (item.warga[0]?.nama ?? "-") : (item.warga?.nama ?? "-")}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatRupiah(Number(item.nominal ?? 0))}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatTanggal(item.tanggal_bayar)}</td>
                <td className="px-4 py-3">{item.keterangan || item.bulan || "-"}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
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
