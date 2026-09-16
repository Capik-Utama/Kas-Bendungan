"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

type AuditLog = { id: number; category: string; action: string; description: string; entity: string | null; entity_id: string | null; created_at: string };

function formatDate(value: string) { return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "short", year: "numeric" }).format(new Date(value)); }
function activityLabel(item: AuditLog) {
  if (item.action === "LOGIN" && item.description.toLowerCase().startsWith("login oleh")) return item.description.replace(/^login oleh/i, "Login oleh");
  if (item.action === "LOGIN_TAMU") return "Login oleh tamu";
  if (item.action === "LOGOUT") return "Logout";
  if (item.action === "GANTI_PASSWORD") return "Ganti password";
  const action = item.action === "INSERT" ? "Tambah" : item.action === "UPDATE" ? "Ubah" : item.action === "DELETE" ? "Hapus" : item.action;
  return `${action} ${item.entity ?? "data"}`;
}

export default function LogsPage() {
  const { profile, isGuest } = useAuth();
  const canView = !isGuest && Boolean(profile) && profile?.role !== "anggota";
  const [items, setItems] = useState<AuditLog[]>([]);
  const [category, setCategory] = useState("Semua");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canView || !supabase) return;
    const loadLogs = async () => {
      const { data, error: loadError } = await supabase.from("audit_logs").select("id, category, action, description, entity, entity_id, created_at").order("created_at", { ascending: false }).limit(1000);
      if (loadError) setError(loadError.message);
      else setItems((data as AuditLog[]) ?? []);
    };
    void loadLogs();
  }, [canView]);

  const categories = useMemo(() => ["Semua", ...Array.from(new Set(items.map((item) => item.category))).sort((a, b) => a.localeCompare(b, "id"))], [items]);
  const filtered = useMemo(() => items.filter((item) => {
    const date = item.created_at.slice(0, 10);
    return (category === "Semua" || item.category === category) && (!startDate || date >= startDate) && (!endDate || date <= endDate);
  }), [items, category, startDate, endDate]);

  function downloadPdf() { if (canView) window.print(); }
  if (!canView) return <main className="management-shell"><h1>Akses terbatas</h1><p>Logs/History hanya dapat dilihat oleh pengelola aplikasi.</p></main>;

  return <main className="management-shell space-y-2">
    <div className="management-heading"><div><span className="fund-label">AUDIT APLIKASI</span><h1>Logs / History</h1><p>Catatan aktivitas aplikasi.</p></div><button type="button" onClick={downloadPdf} className="edit-user print:hidden">Download PDF</button></div>
    <section className="flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm print:hidden"><label className="grid gap-1 text-[11px] font-medium text-zinc-600">Kategori<select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-800">{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="grid gap-1 text-[11px] font-medium text-zinc-600">Dari<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-800" /></label><label className="grid gap-1 text-[11px] font-medium text-zinc-600">Sampai<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-800" /></label><button type="button" onClick={() => { setCategory("Semua"); setStartDate(""); setEndDate(""); }} className="rounded-md border border-zinc-300 px-2 py-1 text-xs">Reset</button></section>
    {error && <p className="text-xs text-red-600">{error}</p>}
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm"><table className="min-w-[620px] w-full text-xs"><thead className="bg-zinc-100 text-zinc-700"><tr><th className="px-2 py-1.5 text-left">Waktu</th><th className="px-2 py-1.5 text-left">Aktivitas</th><th className="px-2 py-1.5 text-left">Kategori</th><th className="px-2 py-1.5 text-left">Objek</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id} className="border-t border-zinc-200 align-top"><td className="whitespace-nowrap px-2 py-1.5">{formatDate(item.created_at)}</td><td className="px-2 py-1.5 font-medium">{activityLabel(item)}</td><td className="px-2 py-1.5"><span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium">{item.category}</span></td><td className="px-2 py-1.5">{item.entity ? `${item.entity}${item.entity_id ? ` #${item.entity_id}` : ""}` : "-"}</td></tr>)}{filtered.length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-center text-zinc-500">Belum ada aktivitas pada filter ini.</td></tr>}</tbody></table></div>
    <p className="text-xs text-zinc-500">Menampilkan {filtered.length} dari {items.length} aktivitas.</p>
  </main>;
}
