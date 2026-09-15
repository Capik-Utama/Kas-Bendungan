"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth, type Role, roleLabel } from "@/lib/auth";

const roles: Role[] = ["developer", "ketua", "bendahara", "anggota"];
type Profile = { id: string; username: string; display_name: string; role: Role; nik_ktp: string | null; nik_kk: string | null; nomor_hp: string | null };

type OptionalFields = { nik_ktp: string; nik_kk: string; nomor_hp: string };
const emptyFields: OptionalFields = { nik_ktp: "", nik_kk: "", nomor_hp: "" };

export default function UserPage() {
  const { canManageAccounts, canCreateAccounts, canEditAccounts, profile } = useAuth();
  const [items, setItems] = useState<Profile[]>([]);
  const [username, setUsername] = useState(""); const [displayName, setDisplayName] = useState(""); const [password, setPassword] = useState(""); const [role, setRole] = useState<Role>("anggota");
  const [fields, setFields] = useState<OptionalFields>(emptyFields);
  const [editing, setEditing] = useState<Profile | null>(null); const [notice, setNotice] = useState(""); const [error, setError] = useState("");
  const allowedRoles: Role[] = profile?.role === "developer" ? roles : profile?.role === "ketua" ? ["bendahara", "anggota"] : ["anggota"];
  const canEditTarget = (target: Profile) => target.id === profile?.id || profile?.role === "developer" || profile?.role === "ketua" && target.role !== "developer" || profile?.role === "bendahara" && target.role === "anggota";

  async function loadProfiles() { if (!supabase || !canManageAccounts) return; const { data, error: loadError } = await supabase.from("profiles").select("id, username, display_name, role, nik_ktp, nik_kk, nomor_hp").order("username"); if (loadError) setError(loadError.message); else setItems((data as Profile[]) ?? []); }
  useEffect(() => { void loadProfiles(); }, [canManageAccounts]);

  function resetForm() { setUsername(""); setDisplayName(""); setPassword(""); setRole("anggota"); setFields(emptyFields); setEditing(null); }
  function updateField(name: keyof OptionalFields, value: string) { setFields((current) => ({ ...current, [name]: value })); }
  function validateFields() { if (fields.nik_ktp && !/^\d{16}$/.test(fields.nik_ktp)) return "NIK KTP harus berisi 16 digit."; if (fields.nik_kk && !/^\d{16}$/.test(fields.nik_kk)) return "NIK KK harus berisi 16 digit."; if (fields.nomor_hp && !/^[0-9+() .-]{8,20}$/.test(fields.nomor_hp)) return "Nomor HP tidak valid."; return null; }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return; setError(""); setNotice(""); const fieldError = validateFields(); if (fieldError) { setError(fieldError); return; }
    const optional = { nik_ktp: fields.nik_ktp.trim() || null, nik_kk: fields.nik_kk.trim() || null, nomor_hp: fields.nomor_hp.trim() || null };
    if (editing) {
      if (!canEditTarget(editing)) { setError("Anda tidak memiliki izin mengedit akun ini."); return; }
      if (profile?.role === "bendahara") {
        if (!displayName.trim() || (password && password.length < 8)) { setError("Nama wajib diisi dan password baru minimal 8 karakter."); return; }
        const { error: updateError } = await supabase.rpc("update_member_credentials", { p_user_id: editing.id, p_display_name: displayName.trim(), p_password: password || null });
        if (updateError) { setError(updateError.message); return; }
      } else {
        const { error: updateError } = editing.id === profile?.id ? await supabase.rpc("update_own_username", { p_username: username.trim() }) : await supabase.from("profiles").update({ role }).eq("id", editing.id);
        if (updateError) { setError(updateError.message); return; }
      }
      const { error: fieldError } = await supabase.from("profiles").update(optional).eq("id", editing.id);
      if (fieldError) { setError(fieldError.message); return; }
      setNotice("Data akun berhasil diperbarui."); resetForm(); await loadProfiles(); return;
    }
    const cleanUsername = username.trim(); if (!cleanUsername || password.length < 8) { setError("Username dan password minimal 8 karakter wajib diisi."); return; }
    if (profile?.role === "bendahara" && role !== "anggota") { setError("Bendahara hanya dapat menambahkan akun anggota."); return; }
    const { error: createError } = await supabase.rpc("create_account", { p_username: cleanUsername, p_display_name: displayName.trim() || cleanUsername, p_password: password, p_role: role, p_nik_ktp: optional.nik_ktp, p_nik_kk: optional.nik_kk, p_nomor_hp: optional.nomor_hp });
    if (createError) { setError(createError.message); return; }
    setNotice("Akun berhasil dibuat dan dapat langsung digunakan untuk login."); resetForm(); await loadProfiles();
  }

  if (!canManageAccounts) return <main className="management-shell"><h1>Akses terbatas</h1><p>Anda belum memiliki profil akun.</p></main>;
  const optionalFields = <><label>NIK KTP <span className="optional-label">opsional</span><input inputMode="numeric" maxLength={16} value={fields.nik_ktp} onChange={(event) => updateField("nik_ktp", event.target.value.replace(/\D/g, ""))} placeholder="16 digit" /></label><label>NIK KK <span className="optional-label">opsional</span><input inputMode="numeric" maxLength={16} value={fields.nik_kk} onChange={(event) => updateField("nik_kk", event.target.value.replace(/\D/g, ""))} placeholder="16 digit" /></label><label>No. HP <span className="optional-label">opsional</span><input type="tel" maxLength={20} value={fields.nomor_hp} onChange={(event) => updateField("nomor_hp", event.target.value)} placeholder="08xxxxxxxxxx" /></label></>;
  return <main className="management-shell"><div className="management-heading"><div><span className="fund-label">MANAJEMEN AKSES</span><h1>User</h1><p>Data NIK KTP, NIK KK, dan nomor HP bersifat opsional.</p></div></div>{canCreateAccounts && <form onSubmit={onSubmit} className="user-form"><h2>{editing ? "Edit akun" : "Tambah akun baru"}</h2><div className="user-form-grid"><label>Username<input required disabled={Boolean(editing)} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="contoh: fd" /></label>{(editing || displayName) && <label>Nama tampilan<input required={!editing} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Nama pengguna" /></label>}{!editing && <label>Password<input required type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimal 8 karakter" /></label>}{editing && profile?.role === "bendahara" && <label>Password baru<input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Kosongkan jika tidak diubah" /></label>}<label>Role<select disabled={Boolean(editing && editing.id === profile?.id)} value={role} onChange={(event) => setRole(event.target.value as Role)}>{allowedRoles.map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}</select></label>{optionalFields}</div><div className="user-actions"><button type="submit">{editing ? "Simpan perubahan" : "Buat akun"}</button>{editing && <button type="button" className="secondary-action" onClick={resetForm}>Batal</button>}</div></form>}{notice && <p className="success-note">{notice}</p>}{error && <p className="error-note">{error}</p>}<section className="user-table-wrap"><table className="user-table"><thead><tr><th>Username</th><th>Role</th><th>NIK KTP</th><th>NIK KK</th><th>No. HP</th><th>Aksi</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.username}</td><td><span className={`role-pill role-${item.role}`}>{roleLabel(item.role)}</span></td><td>{item.nik_ktp || "—"}</td><td>{item.nik_kk || "—"}</td><td>{item.nomor_hp || "—"}</td><td>{canEditAccounts && canEditTarget(item) ? <button className="edit-user" onClick={() => { setEditing(item); setUsername(item.username); setDisplayName(item.display_name); setPassword(""); setRole(item.role); setFields({ nik_ktp: item.nik_ktp || "", nik_kk: item.nik_kk || "", nomor_hp: item.nomor_hp || "" }); }}>Edit</button> : <span className="read-only-label">Lihat saja</span>}</td></tr>)}</tbody></table></section></main>;
}
