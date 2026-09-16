"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/lib/auth";

export default function LoginScreen() {
  const { signIn, enterGuest } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setError("");
    const result = await signIn(username, password);
    if (result.error) setError("Username atau password salah. Periksa kembali data masuk Anda.");
    setSubmitting(false);
  }

  async function onGuestEnter() {
    setSubmitting(true); setError("");
    const result = await enterGuest();
    if (result.error) setError("Mode tamu belum tersedia. Silakan coba lagi nanti.");
    setSubmitting(false);
  }

  return <main className="login-shell"><div className="login-card"><img src="/logo-pemuda-desa-wangon-mas.png" alt="Logo Desa Bendungan" className="login-logo" /><h1>Ruang Pembukuan Pemuda Wangon Mas</h1><p>Masuk untuk melihat dan mengelola pembukuan Desa Bendungan sesuai peran Anda.</p><form onSubmit={onSubmit} className="login-form"><label>Username<input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Masukkan username" /></label><label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan password" /></label>{error && <p className="login-error">{error}</p>}<button type="submit" disabled={submitting}>{submitting ? "Memeriksa..." : "Masuk ke aplikasi"}</button></form><button type="button" className="guest-login-button" onClick={() => void onGuestEnter()} disabled={submitting}>Masuk sebagai Tamu</button><small>Tamu hanya dapat melihat data. Akun dan hak akses dikelola oleh developer.</small></div><span className="login-footer-credit">© 2026 Kas Desa - By Capik</span></main>;
}
