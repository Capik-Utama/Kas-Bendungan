"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Warga = { id: number; nama: string; kelompok: string; nik_kk: string | null; nik_ktp: string | null; nomor_telepon: string | null };

export default function WargaPage() {
  const [items, setItems] = useState<Warga[]>([]);
  const [nama, setNama] = useState("");
  const [kelompok, setKelompok] = useState("");
  const [nikKk, setNikKk] = useState("");
  const [nikKtp, setNikKtp] = useState("");
  const [nomorTelepon, setNomorTelepon] = useState("");
  const [error, setError] = useState<string | null>(supabase ? null : "Supabase belum dikonfigurasi.");

  const loadWarga = async () => {
    if (!supabase) return;
    const { data, error: loadError } = await supabase.from("warga").select("id, nama, kelompok, nik_kk, nik_ktp, nomor_telepon").order("nama", { ascending: true });
    if (loadError) { setError(loadError.message); return; }
    setItems((data as Warga[]) ?? []);
  };

  useEffect(() => {
    const timeout = setTimeout(() => { void loadWarga(); }, 0);
    return () => clearTimeout(timeout);
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    if (!nama.trim() || !kelompok.trim()) { setError("Nama anggota dan kelompok wajib diisi."); return; }
    const { error: insertError } = await supabase.from("warga").insert({ nama: nama.trim(), kelompok: kelompok.trim(), nik_kk: nikKk.trim() || null, nik_ktp: nikKtp.trim() || null, nomor_telepon: nomorTelepon.trim() || null });
    if (insertError) { setError(insertError.message); return; }
    setNama(""); setKelompok(""); setNikKk(""); setNikKtp(""); setNomorTelepon(""); setError(null); await loadWarga();
  };

  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Data Anggota</h1><p className="text-sm text-zinc-600">Nama anggota (kepala keluarga) dan kelompok wajib diisi. NIK KK, NIK KTP, dan nomor HP bersifat opsional.</p><form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-3"><input required value={nama} onChange={(event) => setNama(event.target.value)} placeholder="Nama anggota (kepala keluarga) *" className="rounded-lg border border-zinc-300 px-3 py-2" /><input required value={kelompok} onChange={(event) => setKelompok(event.target.value)} placeholder="Kelompok *" className="rounded-lg border border-zinc-300 px-3 py-2" /><input value={nikKk} onChange={(event) => setNikKk(event.target.value)} placeholder="NIK KK (opsional)" className="rounded-lg border border-zinc-300 px-3 py-2" /><input value={nikKtp} onChange={(event) => setNikKtp(event.target.value)} placeholder="NIK KTP (opsional)" className="rounded-lg border border-zinc-300 px-3 py-2" /><input value={nomorTelepon} onChange={(event) => setNomorTelepon(event.target.value)} placeholder="No. HP (opsional)" className="rounded-lg border border-zinc-300 px-3 py-2" /><button className="rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-700" type="submit">Simpan Anggota</button></form>{error ? <p className="text-sm text-red-600">{error}</p> : null}<div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-zinc-100 text-zinc-700"><tr><th className="px-4 py-3">Nama Anggota</th><th className="px-4 py-3">Kelompok</th><th className="px-4 py-3">NIK KK</th><th className="px-4 py-3">NIK KTP</th><th className="px-4 py-3">No. HP</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t border-zinc-200"><td className="px-4 py-3">{item.nama}</td><td className="px-4 py-3">{item.kelompok}</td><td className="px-4 py-3">{item.nik_kk || "-"}</td><td className="px-4 py-3">{item.nik_ktp || "-"}</td><td className="px-4 py-3">{item.nomor_telepon || "-"}</td></tr>)}{items.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-center text-zinc-500">Belum ada data anggota.</td></tr> : null}</tbody></table></div></section>;
}
