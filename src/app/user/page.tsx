"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth, type Role, roleLabel } from "@/lib/auth";

const roles: Role[] = ["developer", "ketua", "bendahara", "anggota"];
type Profile = { id: string; username: string; display_name: string; role: Role };

export default function UserPage() {
  const { canManageAccounts, canCreateAccounts, canEditAccounts, profile } = useAuth();
  const [items, setItems] = useState<Profile[]>([]);
  const [username, setUsername] = useState(""); const [displayName, setDisplayName] = useState(""); const [password, setPassword] = useState(""); const [role, setRole] = useState<Role>("anggota");
  const [editing, setEditing] = useState<Profile | null>(null); const [notice, setNotice] = useState(""); const [error, setError] = useState("");
  const allowedRoles: Role[] = profile?.role === "developer" ? roles : profile?.role === "ketua" ? ["bendahara", "anggota"] : ["anggota"];
  const canEditTarget = (target: Profile) => target.id === profile?.id || profile?.role === "developer" || profile?.role === "ketua" && target.role !== "developer" || profile?.role === "bendahara" && target.role === "anggota";

  async function loadProfiles() { if (!supabase || !canManageAccounts) return; const { data, error: loadError } = await supabase.from("profiles").select("id, username, display_name, role").order("username"); if (loadError) setError(loadError.message); else setItems((data as Profile[]) ?? []); }
  useEffect(() => { void loadProfiles(); }, [canManageAccounts]);

  function resetForm() { setUsername(""); setDisplayName(""); setPassword(""); setRole("anggota"); setEditing(null); }
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return; setError(""); setNotice("");
    if (editing) {
      if (!canEditTarget(editing)) { setError("Anda tidak memiliki izin mengedit akun ini."); return; }
      if (profile?.role === "bendahara") {
        if (!displayName.trim() || (password && password.length < 8)) { setError("Nama wajib diisi dan password baru minimal 8 karakter."); return; }
        const { error: updateError } = await supabase.rpc("update_member_credentials", { p_user_id: editing.id, p_display_name: displayName.trim(), p_password: password || null });
        if (updateError) setError(updateError.message); else { setNotice("Nama dan password akun berhasil diperbarui."); resetForm(); await loadProfiles(); }
        return;
      }
      const { error: updateError } = editing.id === profile?.id
        ? await supabase.rpc("update_own_username", { p_username: username.trim() })
        : await supabase.from("profiles").update({ role }).eq("id", editing.id);
      if (updateError) setError(updateError.message); else { setNotice("Data akun berhasil diperbarui."); resetForm(); await loadProfiles(); }
      return;
    }
    const cleanUsername = username.trim();
    if (!cleanUsername || password.length < 8) { setError("Username dan password minimal 8 karakter wajib diisi."); return; }
    if (profile?.role === "bendahara" && role !== "anggota") { setError("Bendahara hanya dapat menambahkan akun anggota."); return; }
    const { error: createError } = await supabase.rpc("create_account", { p_username: cleanUsername, p_display_name: cleanUsername, p_password: password, p_role: role });
    if (createError) { setError(createError.message); return; }
    setNotice("Akun berhasil dibuat dan dapat langsung digunakan untuk login."); resetForm(); await loadProfiles();
  }

  if (!canManageAccounts) return <main className="management-shell"><h1>Akses terbatas</h1><p>Anda belum memiliki profil akun.</p></main>;
  return <main className="management-shell"><div className="management-heading"><div><span className="fund-label">MANAJEMEN AKSES</span><h1>User</h1><p>{profile?.role === "bendahara" ? "Tambah anggota dan edit nama serta password akun sendiri atau anggota." : profile?.role === "anggota" ? "Anggota hanya dapat melihat akun." : "Username adalah identitas akun untuk semua level pengguna."}</p></div></div>{canCreateAccounts && <form onSubmit={onSubmit} className="user-form"><h2>{editing ? "Edit akun" : "Tambah akun baru"}</h2><div className="user-form-grid"><label>Username<input required disabled={Boolean(editing)} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="contoh: fd" /></label>{editing && profile?.role === "bendahara" && <label>Nama tampilan<input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Nama pengguna" /></label>}{!editing && <label>Password<input required type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimal 8 karakter" /></label>}{editing && profile?.role === "bendahara" && <label>Password baru<input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Kosongkan jika tidak diubah" /></label>}<label>Role<select disabled={Boolean(editing && editing.id === profile?.id)} value={role} onChange={(event) => setRole(event.target.value as Role)}>{allowedRoles.map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}</select></label></div><div className="user-actions"><button type="submit">{editing ? "Simpan perubahan" : "Buat akun"}</button>{editing && <button type="button" className="secondary-action" onClick={resetForm}>Batal</button>}</div></form>}{notice && <p className="success-note">{notice}</p>}{error && <p className="error-note">{error}</p>}<section className="user-table-wrap"><table className="user-table"><thead><tr><th>Username</th><th>Role</th><th>Aksi</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.username}</td><td><span className={`role-pill role-${item.role}`}>{roleLabel(item.role)}</span></td><td>{canEditAccounts && canEditTarget(item) ? <button className="edit-user" onClick={() => { setEditing(item); setUsername(item.username); setDisplayName(item.display_name); setPassword(""); setRole(item.role); }}>Edit</button> : <span className="read-only-label">Lihat saja</span>}</td></tr>)}</tbody></table></section></main>;
}
