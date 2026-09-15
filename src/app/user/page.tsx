"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth, type Role, roleLabel } from "@/lib/auth";

const roles: Role[] = ["developer", "ketua", "bendahara", "anggota"];
type Group = { id: number; nama: string };
type Profile = { id: string; username: string; display_name: string; role: Role; nik_ktp: string | null; nik_kk: string | null; nomor_hp: string | null; profile_kelompok?: { kelompok_id: number }[] };
type OptionalFields = { nik_ktp: string; nik_kk: string; nomor_hp: string };
const emptyFields: OptionalFields = { nik_ktp: "", nik_kk: "", nomor_hp: "" };

export default function UserPage() {
  const { canManageAccounts, canCreateAccounts, canEditAccounts, profile } = useAuth();
  const [items, setItems] = useState<Profile[]>([]); const [groups, setGroups] = useState<Group[]>([]); const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [role, setRole] = useState<Role>("anggota");
  const [fields, setFields] = useState<OptionalFields>(emptyFields); const [editing, setEditing] = useState<Profile | null>(null); const [ownPassword, setOwnPassword] = useState(""); const [notice, setNotice] = useState(""); const [error, setError] = useState("");
  const allowedRoles: Role[] = profile?.role === "developer" ? roles : profile?.role === "ketua" ? ["bendahara", "anggota"] : ["anggota"];
  const canEditTarget = (target: Profile) => target.id === profile?.id || profile?.role === "developer" || profile?.role === "ketua" && target.role !== "developer" || profile?.role === "bendahara" && target.role === "anggota";

  async function loadProfiles() { if (!supabase || !canManageAccounts) return; const { data, error: loadError } = await supabase.from("profiles").select("id, username, display_name, role, nik_ktp, nik_kk, nomor_hp, profile_kelompok(kelompok_id)").order("username"); if (loadError) setError(loadError.message); else setItems((data as Profile[]) ?? []); }
  async function loadGroups() { if (!supabase) return; const { data, error: loadError } = await supabase.from("kelompok").select("id, nama").order("nama"); if (loadError) setError(loadError.message); else setGroups((data as Group[]) ?? []); }
  useEffect(() => { void loadProfiles(); void loadGroups(); }, [canManageAccounts]);
  function resetForm() { setUsername(""); setPassword(""); setRole("anggota"); setFields(emptyFields); setSelectedGroups([]); setEditing(null); }
  function updateField(name: keyof OptionalFields, value: string) { setFields((current) => ({ ...current, [name]: value })); }
  function toggleGroup(id: number) { setSelectedGroups((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function validateFields() { if (!selectedGroups.length) return "Pilih minimal satu kelompok."; if (fields.nik_ktp && !/^\d{16}$/.test(fields.nik_ktp)) return "NIK KTP harus berisi 16 digit."; if (fields.nik_kk && !/^\d{16}$/.test(fields.nik_kk)) return "NIK KK harus berisi 16 digit."; if (fields.nomor_hp && !/^[0-9+() .-]{8,20}$/.test(fields.nomor_hp)) return "Nomor HP tidak valid."; return null; }
  async function saveGroups(profileId: string) { if (!supabase) return null; const { error: deleteError } = await supabase.from("profile_kelompok").delete().eq("profile_id", profileId); if (deleteError) return deleteError; if (!selectedGroups.length) return null; const { error: insertError } = await supabase.from("profile_kelompok").insert(selectedGroups.map((kelompok_id) => ({ profile_id: profileId, kelompok_id }))); return insertError; }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return; setError(""); setNotice(""); const validationError = validateFields(); if (validationError) { setError(validationError); return; }
    const optional = { nik_ktp: fields.nik_ktp.trim() || null, nik_kk: fields.nik_kk.trim() || null, nomor_hp: fields.nomor_hp.trim() || null };
    if (editing) {
      if (!canEditTarget(editing)) { setError("Anda tidak memiliki izin mengedit akun ini."); return; }
      if (password && password.length < 8) { setError("Password baru minimal 8 karakter."); return; }
      if (password) { const { error: passwordError } = await supabase.rpc("update_account_password", { p_user_id: editing.id, p_password: password }); if (passwordError) { setError(passwordError.message); return; } }
      const { error: accountError } = editing.id === profile?.id ? await supabase.rpc("update_own_username", { p_username: username.trim() }) : await supabase.from("profiles").update({ role }).eq("id", editing.id);
      if (accountError) { setError(accountError.message); return; }
      const { error: fieldError } = await supabase.from("profiles").update(optional).eq("id", editing.id); if (fieldError) { setError(fieldError.message); return; }
      const groupError = await saveGroups(editing.id); if (groupError) { setError(groupError.message); return; }
      setNotice("Data akun dan kelompok berhasil diperbarui."); resetForm(); await loadProfiles(); return;
    }
    const cleanUsername = username.trim(); if (!cleanUsername || password.length < 8) { setError("Username dan password minimal 8 karakter wajib diisi."); return; }
    if (profile?.role === "bendahara" && role !== "anggota") { setError("Bendahara hanya dapat menambahkan akun anggota."); return; }
    const { data: newId, error: createError } = await supabase.rpc("create_account", { p_username: cleanUsername, p_display_name: cleanUsername, p_password: password, p_role: role, p_nik_ktp: optional.nik_ktp, p_nik_kk: optional.nik_kk, p_nomor_hp: optional.nomor_hp });
    if (createError) { setError(createError.message); return; }
    const groupError = await saveGroups(newId as string); if (groupError) { setError(groupError.message); return; }
    setNotice("Akun berhasil dibuat dan kelompok berhasil disimpan."); resetForm(); await loadProfiles();
  }
  async function onOwnPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return; setError(""); setNotice("");
    if (ownPassword.length < 8) { setError("Password baru minimal 8 karakter."); return; }
    const { error: passwordError } = await supabase.rpc("update_own_password", { p_password: ownPassword });
    if (passwordError) { setError(passwordError.message); return; }
    setOwnPassword(""); setNotice("Password akun Anda berhasil diperbarui.");
  }

  if (!canManageAccounts) return <main className="management-shell"><h1>Akses terbatas</h1><p>Anda belum memiliki profil akun.</p></main>;
  const optionalFields = <><label>NIK KTP <span className="optional-label">opsional</span><input inputMode="numeric" maxLength={16} value={fields.nik_ktp} onChange={(event) => updateField("nik_ktp", event.target.value.replace(/\D/g, ""))} placeholder="16 digit" /></label><label>NIK KK <span className="optional-label">opsional</span><input inputMode="numeric" maxLength={16} value={fields.nik_kk} onChange={(event) => updateField("nik_kk", event.target.value.replace(/\D/g, ""))} placeholder="16 digit" /></label><label>No. HP <span className="optional-label">opsional</span><input type="tel" maxLength={20} value={fields.nomor_hp} onChange={(event) => updateField("nomor_hp", event.target.value)} placeholder="08xxxxxxxxxx" /></label></>;
  const groupChecklist = <fieldset className="group-checklist"><legend>Kelompok <span className="optional-label">pilih satu atau lebih</span></legend>{groups.map((group) => <label key={group.id} className="group-option"><input type="checkbox" checked={selectedGroups.includes(group.id)} onChange={() => toggleGroup(group.id)} />{group.nama}</label>)}</fieldset>;
  return <main className="management-shell"><div className="management-heading"><div><span className="fund-label">MANAJEMEN AKSES</span><h1>User</h1><p>Satu user dapat mengikuti beberapa kelompok sekaligus.</p></div></div>{profile?.role === "anggota" && <form onSubmit={onOwnPasswordSubmit} className="user-form"><h2>Ubah password sendiri</h2><div className="user-form-grid"><label>Password baru<input required type="password" minLength={8} value={ownPassword} onChange={(event) => setOwnPassword(event.target.value)} placeholder="Minimal 8 karakter" /></label></div><div className="user-actions"><button type="submit">Simpan password</button></div></form>}{canCreateAccounts && <form onSubmit={onSubmit} className="user-form"><h2>{editing ? "Edit akun" : "Tambah akun baru"}</h2><div className="user-form-grid"><label>Username<input required disabled={Boolean(editing)} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="contoh: firda" /></label><label>{editing ? "Password baru" : "Password"} <span className="optional-label">{editing ? "kosongkan jika tetap" : "wajib"}</span><input required={!editing} type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={editing ? "Tidak diubah jika kosong" : "Minimal 8 karakter"} /></label><label>Role<select disabled={Boolean(editing && editing.id === profile?.id)} value={role} onChange={(event) => setRole(event.target.value as Role)}>{allowedRoles.map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}</select></label>{optionalFields}{groupChecklist}</div><div className="user-actions"><button type="submit">{editing ? "Simpan perubahan" : "Buat akun"}</button>{editing && <button type="button" className="secondary-action" onClick={resetForm}>Batal</button>}</div></form>}{notice && <p className="success-note">{notice}</p>}{error && <p className="error-note">{error}</p>}<section className="user-table-wrap"><table className="user-table"><thead><tr><th>Username</th><th>Role</th><th>Kelompok</th><th>NIK KTP</th><th>NIK KK</th><th>No. HP</th><th>Aksi</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.username}</td><td><span className={`role-pill role-${item.role}`}>{roleLabel(item.role)}</span></td><td>{(item.profile_kelompok || []).map((membership) => groups.find((group) => group.id === membership.kelompok_id)?.nama).filter(Boolean).join(", ") || "—"}</td><td>{item.nik_ktp || "—"}</td><td>{item.nik_kk || "—"}</td><td>{item.nomor_hp || "—"}</td><td>{canEditAccounts && canEditTarget(item) ? <button className="edit-user" onClick={() => { setEditing(item); setUsername(item.username); setPassword(""); setRole(item.role); setFields({ nik_ktp: item.nik_ktp || "", nik_kk: item.nik_kk || "", nomor_hp: item.nomor_hp || "" }); setSelectedGroups((item.profile_kelompok || []).map((membership) => membership.kelompok_id)); }}>Edit</button> : <span className="read-only-label">Lihat saja</span>}</td></tr>)}</tbody></table></section></main>;
}
