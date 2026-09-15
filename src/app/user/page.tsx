"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth, type Role, roleLabel } from "@/lib/auth";

const roles: Role[] = ["developer", "ketua", "bendahara", "anggota"];
type Profile = { id: string; username: string; display_name: string; role: Role };

export default function UserPage() {
  const { canManageAccounts, profile } = useAuth();
  const [items, setItems] = useState<Profile[]>([]);
  const [username, setUsername] = useState(""); const [displayName, setDisplayName] = useState(""); const [password, setPassword] = useState(""); const [role, setRole] = useState<Role>("anggota");
  const [editing, setEditing] = useState<Profile | null>(null); const [notice, setNotice] = useState(""); const [error, setError] = useState("");
  const allowedRoles: Role[] = profile?.role === "developer" ? roles : ["bendahara", "anggota"];

  async function loadProfiles() { if (!supabase || !canManageAccounts) return; const { data, error: loadError } = await supabase.from("profiles").select("id, username, display_name, role").order("username"); if (loadError) setError(loadError.message); else setItems((data as Profile[]) ?? []); }
  useEffect(() => { void loadProfiles(); }, [canManageAccounts]);

  function resetForm() { setUsername(""); setDisplayName(""); setPassword(""); setRole("anggota"); setEditing(null); }
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return; setError(""); setNotice("");
    if (editing) {
      const { error: updateError } = await supabase.from("profiles").update({ display_name: displayName.trim(), role }).eq("id", editing.id);
      if (updateError) setError(updateError.message); else { setNotice("Data akun berhasil diperbarui."); resetForm(); await loadProfiles(); }
      return;
    }
    const cleanUsername = username.trim();
    if (!cleanUsername || !displayName.trim() || password.length < 8) { setError("Username, nama, dan password minimal 8 karakter wajib diisi."); return; }
    const { error: createError } = await supabase.rpc("create_account", { p_username: cleanUsername, p_display_name: displayName.trim(), p_password: password, p_role: role });
    if (createError) { setError(createError.message); return; }
    setNotice("Akun berhasil dibuat dan dapat langsung digunakan untuk login."); resetForm(); await loadProfiles();
  }

  if (!canManageAccounts) return <main className="management-shell"><h1>Akses terbatas</h1><p>Menu User hanya dapat dibuka oleh developer atau ketua.</p></main>;
  return <main className="management-shell"><div className="management-heading"><div><span className="fund-label">MANAJEMEN AKSES</span><h1>User</h1><p>Tambah akun bendahara dan anggota sesuai hak akses Anda.</p></div></div><form onSubmit={onSubmit} className="user-form"><h2>{editing ? "Edit akun" : "Tambah akun baru"}</h2><div className="user-form-grid"><label>Username<input required disabled={Boolean(editing)} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="contoh: bendahara1" /></label><label>Nama tampilan<input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Nama pengguna" /></label>{!editing && <label>Password<input required type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimal 8 karakter" /></label>}<label>Role<select value={role} onChange={(event) => setRole(event.target.value as Role)}>{allowedRoles.map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}</select></label></div><div className="user-actions"><button type="submit">{editing ? "Simpan perubahan" : "Buat akun"}</button>{editing && <button type="button" className="secondary-action" onClick={resetForm}>Batal</button>}</div></form>{notice && <p className="success-note">{notice}</p>}{error && <p className="error-note">{error}</p>}<section className="user-table-wrap"><table className="user-table"><thead><tr><th>Username</th><th>Nama</th><th>Role</th><th>Aksi</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.username}</td><td>{item.display_name}</td><td><span className={`role-pill role-${item.role}`}>{roleLabel(item.role)}</span></td><td><button className="edit-user" onClick={() => { setEditing(item); setUsername(item.username); setDisplayName(item.display_name); setRole(item.role); }}>Edit</button></td></tr>)}</tbody></table></section></main>;
}
