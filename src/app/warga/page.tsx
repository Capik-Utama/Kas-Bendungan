"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Warga = {
  id: number;
  nama: string;
  alamat_rt: string;
  nomor_telepon: string;
};

export default function WargaPage() {
  const [items, setItems] = useState<Warga[]>([]);
  const [nama, setNama] = useState("");
  const [alamatRt, setAlamatRt] = useState("");
  const [nomorTelepon, setNomorTelepon] = useState("");
  const [error, setError] = useState<string | null>(
    supabase ? null : "Supabase belum dikonfigurasi.",
  );

  const loadWarga = async () => {
    if (!supabase) return;

    const { data, error: loadError } = await supabase
      .from("warga")
      .select("id, nama, alamat_rt, nomor_telepon")
      .order("nama", { ascending: true });

    if (loadError) {
      setError(loadError.message);
      return;
    }

    setItems((data as Warga[]) ?? []);
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadWarga();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!supabase) {
      return;
    }

    const { error: insertError } = await supabase.from("warga").insert({
      nama,
      alamat_rt: alamatRt,
      nomor_telepon: nomorTelepon,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNama("");
    setAlamatRt("");
    setNomorTelepon("");
    setError(null);
    await loadWarga();
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Data Warga</h1>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-4">
        <input
          required
          value={nama}
          onChange={(event) => setNama(event.target.value)}
          placeholder="Nama warga"
          className="rounded-lg border border-zinc-300 px-3 py-2"
        />
        <input
          required
          value={alamatRt}
          onChange={(event) => setAlamatRt(event.target.value)}
          placeholder="Alamat / RT"
          className="rounded-lg border border-zinc-300 px-3 py-2"
        />
        <input
          required
          value={nomorTelepon}
          onChange={(event) => setNomorTelepon(event.target.value)}
          placeholder="Nomor telepon"
          className="rounded-lg border border-zinc-300 px-3 py-2"
        />
        <button className="rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-700" type="submit">
          Simpan Warga
        </button>
      </form>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-100 text-zinc-700">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Alamat / RT</th>
              <th className="px-4 py-3">Nomor Telepon</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-zinc-200">
                <td className="px-4 py-3">{item.nama}</td>
                <td className="px-4 py-3">{item.alamat_rt}</td>
                <td className="px-4 py-3">{item.nomor_telepon}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-zinc-500">
                  Belum ada data warga.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
