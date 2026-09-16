"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

type Actor = { username: string } | { username: string }[] | null;
type AuditLog = { id: number; category: string; action: string; description: string; entity: string | null; entity_id: string | null; created_at: string; actor: Actor };

function actorName(actor: Actor) { return Array.isArray(actor) ? actor[0]?.username ?? "Sistem" : actor?.username ?? "Sistem"; }
function formatDate(value: string) { return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

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
      const { data, error: loadError } = await supabase.from("audit_logs").select("id, category, action, description, entity, entity_id, created_at, actor:actor_id(username)").order("created_at", { ascending: false }).limit(1000);
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

  return <main className="management-shell space-y-4"><div className="management-heading"><div><span className="fund-label">AUDIT APLIKASI</span><h1>Logs / History</h1><p>Catatan seluruh aktivitas aplikasi, termasuk autentikasi, transaksi, akun, anggota, dan kelompok.</p></div><button type="button" onClick={downloadPdf} className="edit-user print:hidden">Download PDF</button></div><section className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm print:hidden"><label className="grid gap-1 text-xs font-medium text-zinc-600">Kategori<select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800">{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="grid gap-1 text-xs font-medium text-zinc-600">Dari<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800" /></label><label className="grid gap-1 text-xs font-medium text-zinc-600">Sampai<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800" /></label><button type="button" onClick={() => { setCategory("Semua"); setStartDate(""); setEndDate(""); }} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">Reset filter</button></section>{error && <p className="text-sm text-red-600">{error}</p>}<div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm"><table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-zinc-100 text-zinc-700"><tr><th className="px-4 py-3">Waktu</th><th className="px-4 py-3">Kategori</th><th className="px-4 py-3">Aktivitas</th><th className="px-4 py-3">Petugas</th><th className="px-4 py-3">Objek</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id} className="border-t border-zinc-200 align-top"><td className="whitespace-nowrap px-4 py-3">{formatDate(item.created_at)}</td><td className="px-4 py-3"><span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium">{item.category}</span></td><td className="px-4 py-3"><b>{item.action}</b><span className="block text-zinc-600">{item.description}</span></td><td className="px-4 py-3">{actorName(item.actor)}</td><td className="px-4 py-3">{item.entity ? `${item.entity}${item.entity_id ? ` #${item.entity_id}` : ""}` : "-"}</td></tr>)}{filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-500">Belum ada aktivitas pada filter ini.</td></tr>}</tbody></table></div><p className="text-sm text-zinc-500">Menampilkan {filtered.length} dari {items.length} aktivitas.</p></main>;
}

