"use client";

import { ChangeEvent, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const tableNames = ["warga", "kelompok", "warga_kelompok", "iuran", "pengeluaran", "kartu_kas"] as const;
type TableName = (typeof tableNames)[number];
type SheetRow = Record<string, unknown>;

function downloadWorkbook(workbook: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(workbook, filename);
}

function makeWorkbook(sheets: Record<string, SheetRow[]>) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
  return workbook;
}

export default function PengaturanPage() {
  const { canEdit, isGuest, profile } = useAuth();
  const isReadOnly = isGuest || profile?.role === "anggota";
  const importRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4000);
  }

  async function readTables(): Promise<Record<string, SheetRow[]> | null> {
    if (!supabase) { showNotice("Supabase belum terkonfigurasi."); return null; }
    const result: Record<string, SheetRow[]> = {};
    for (const table of tableNames) {
      const { data, error } = await supabase.from(table).select("*").limit(10000);
      if (error) { showNotice(`Gagal membaca data ${table}: ${error.message}`); return null; }
      result[table] = (data ?? []) as SheetRow[];
    }
    return result;
  }

  async function exportAll(kind: "backup" | "export") {
    if (isReadOnly) { showNotice("Mode lihat saja tidak dapat mengunduh data mentah."); return; }
    setBusy(true);
    const sheets = await readTables();
    if (sheets) {
      const workbook = makeWorkbook({
        README: [{ Keterangan: kind === "backup" ? "Backup lengkap Kas Wangon Mas. Jangan mengubah nama sheet saat restore." : "Export data Kas Wangon Mas." }, { Dibuat: new Date().toISOString() }],
        ...sheets,
      });
      downloadWorkbook(workbook, `kas-wangon-mas-${kind}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      showNotice(`${kind === "backup" ? "Backup" : "Export"} Excel berhasil diunduh.`);
    }
    setBusy(false);
  }

  function downloadTemplate() {
    if (isReadOnly) { showNotice("Mode lihat saja tidak dapat mengunduh file."); return; }
    const workbook = makeWorkbook({
      Anggota: [{ Nama: "Toha", Kelompok: "Umum", "NIK KK": "", "NIK KTP": "", "Alamat/RT": "", "Nomor Telepon": "" }],
      Petunjuk: [{ Keterangan: "Isi sheet Anggota. Satu baris untuk satu anggota. Pisahkan beberapa kelompok dengan koma." }, { Keterangan: "Nama kolom jangan diubah agar import berjalan lancar." }],
    });
    downloadWorkbook(workbook, "template-import-anggota-kas-wangon-mas.xlsx");
    showNotice("Template Excel berhasil diunduh.");
  }

  async function importMembers(event: ChangeEvent<HTMLInputElement>) {
    if (isReadOnly) { showNotice("Mode lihat saja hanya dapat melihat data."); return; }
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !supabase) return;
    setBusy(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets.Anggota ?? workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("Sheet Anggota tidak ditemukan.");
      const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: "" });
      if (!rows.length) throw new Error("Sheet Anggota masih kosong.");
      let imported = 0;
      for (const row of rows) {
        const nama = String(row.Nama ?? row.nama ?? "").trim();
        if (!nama) continue;
        const groupNames = String(row.Kelompok ?? row.kelompok ?? "").split(",").map((value) => value.trim()).filter(Boolean);
        if (!groupNames.length) throw new Error(`Anggota ${nama} belum memiliki kelompok.`);
        const { data: member, error: memberError } = await supabase.from("warga").insert({ nama, kelompok: groupNames[0], nik_kk: String(row["NIK KK"] ?? "").trim() || null, nik_ktp: String(row["NIK KTP"] ?? "").trim() || null, alamat_rt: String(row["Alamat/RT"] ?? row.alamat_rt ?? "").trim() || null, nomor_telepon: String(row["Nomor Telepon"] ?? row.nomor_telepon ?? "").trim() || null }).select("id").single();
        if (memberError || !member) throw new Error(memberError?.message ?? `Gagal menyimpan ${nama}.`);
        const { data: groups, error: groupError } = await supabase.from("kelompok").select("id,nama").in("nama", groupNames);
        if (groupError) throw new Error(groupError.message);
        const found = new Set((groups ?? []).map((group) => group.nama));
        const missing = groupNames.filter((groupName) => !found.has(groupName));
        if (missing.length) throw new Error(`Kelompok tidak ditemukan: ${missing.join(", ")}. Buat kelompok terlebih dahulu.`);
        const { error: membershipError } = await supabase.from("warga_kelompok").insert((groups ?? []).map((group) => ({ warga_id: member.id, kelompok_id: group.id })));
        if (membershipError) throw new Error(membershipError.message);
        imported += 1;
      }
      showNotice(`${imported} anggota berhasil diimport dari Excel.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Import Excel gagal.");
    } finally { setBusy(false); }
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    if (isReadOnly) { showNotice("Mode lihat saja hanya dapat melihat data."); return; }
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !supabase) return;
    if (!window.confirm("Restore akan menambahkan data dari file backup ke Supabase. Lanjutkan?")) return;
    setBusy(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheets = Object.fromEntries(tableNames.map((table) => [table, workbook.Sheets[table] ? XLSX.utils.sheet_to_json<SheetRow>(workbook.Sheets[table], { defval: "" }) : []])) as Record<TableName, SheetRow[]>;
      if (!sheets.warga.length && !sheets.kelompok.length && !sheets.kartu_kas.length) throw new Error("File bukan backup Kas Wangon Mas atau tidak memiliki data.");
      for (const table of ["kelompok", "kartu_kas", "warga"] as const) {
        if (sheets[table].length) { const { error } = await supabase.from(table).upsert(sheets[table], { onConflict: "id" }); if (error) throw new Error(`${table}: ${error.message}`); }
      }
      for (const table of ["warga_kelompok", "iuran", "pengeluaran"] as const) {
        if (sheets[table].length) { const { error } = await supabase.from(table).upsert(sheets[table], { onConflict: table === "warga_kelompok" ? "warga_id,kelompok_id" : "id" }); if (error) throw new Error(`${table}: ${error.message}`); }
      }
      showNotice("Restore backup Excel berhasil.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Restore gagal.");
    } finally { setBusy(false); }
  }

  return <main className="dashboard-shell settings-page"><div className="grain" aria-hidden="true" /><div className="settings-content"><span className="fund-label">PENGATURAN DATA</span><h1>Backup dan data Excel</h1><p className="settings-intro">Kelola salinan data Kas Wangon Mas dalam format Excel. Gunakan template untuk menyiapkan data anggota sebelum diimport.</p>{isReadOnly ? <div className="settings-note"><b>Mode lihat saja</b><span>Tamu dapat melihat isi pembukuan, tetapi unduh backup, export, restore, dan import data dinonaktifkan untuk menjaga privasi.</span></div> : <div className="settings-grid"><section className="settings-card"><span className="settings-number">01</span><h2>Backup</h2><p>Unduh seluruh tabel Supabase ke satu file Excel sebagai cadangan lengkap.</p><button disabled={busy} onClick={() => void exportAll("backup")}>Unduh Backup Excel</button></section><section className="settings-card"><span className="settings-number">02</span><h2>Restore</h2><p>Tambahkan kembali data dari file backup Excel ke Supabase. Data dengan ID sama akan diperbarui.</p><button disabled={busy} onClick={() => restoreRef.current?.click()}>Pilih File Restore</button><input ref={restoreRef} hidden type="file" accept=".xlsx,.xls" onChange={(event) => void restoreBackup(event)} /></section><section className="settings-card"><span className="settings-number">03</span><h2>Import</h2><p>Isi data pelanggan/anggota melalui template Excel, lalu masukkan ke sistem.</p><button onClick={downloadTemplate}>Unduh Template Anggota</button>{canEdit && <><button disabled={busy} className="secondary-action" onClick={() => importRef.current?.click()}>Import File Excel</button><input ref={importRef} hidden type="file" accept=".xlsx,.xls" onChange={(event) => void importMembers(event)} /></>}</section><section className="settings-card"><span className="settings-number">04</span><h2>Export</h2><p>Unduh salinan data untuk dibaca atau diolah di Microsoft Excel, Google Sheets, atau LibreOffice.</p><button disabled={busy} onClick={() => void exportAll("export")}>Export ke Excel</button></section></div>}<div className="settings-note"><b>Format import anggota</b><span>Kolom wajib: Nama dan Kelompok. Jika satu anggota mengikuti beberapa kelompok, pisahkan nama kelompok dengan koma.</span></div>{notice && <div className="toast">{notice}</div>}</div></main>;
}
