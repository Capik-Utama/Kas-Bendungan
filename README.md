# Kas Kampung - Next.js + Supabase

Aplikasi web modern untuk pengelolaan kas RT/warga menggunakan Next.js (App Router), Tailwind CSS, dan Supabase.

## Fitur

- Dashboard ringkasan kas (saldo, total iuran masuk, total pengeluaran) dengan update real-time.
- Modul Data Anggota (nama, alamat/RT, nomor telepon).
- Modul Pencatatan Iuran (pilih warga, nominal, bulan, keterangan).
- Modul Pencatatan Pengeluaran (keperluan, tanggal, nominal, keterangan).
- Halaman Transparansi/Riwayat transaksi masuk dan keluar.

## Setup

1. Install dependency:

   ```bash
   npm install
   ```

2. Salin env dan isi kredensial Supabase:

   ```bash
   cp .env.example .env.local
   ```

3. Jalankan SQL schema pada Supabase SQL Editor:

   - `supabase/schema.sql`

4. Jalankan aplikasi:

   ```bash
   npm run dev
   ```

## Struktur penting

- `src/lib/supabase.ts` - konfigurasi client Supabase.
- `supabase/schema.sql` - skema tabel `warga`, `iuran`, `pengeluaran`.
- `src/app/*` - halaman dashboard dan modul kas kampung.
