"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export const ROLES = ["developer", "ketua", "bendahara", "anggota"] as const;
export type Role = (typeof ROLES)[number];

export type AppProfile = { id: string; username: string; display_name: string; role: Role; nik_ktp: string | null; nik_kk: string | null; nomor_hp: string | null };

type AuthContextValue = {
  user: User | null;
  profile: AppProfile | null;
  loading: boolean;
  isGuest: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  enterGuest: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  canEdit: boolean;
  canManageAccounts: boolean;
  canCreateAccounts: boolean;
  canEditAccounts: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const guestProfile: AppProfile = { id: "guest", username: "Tamu", display_name: "Tamu", role: "anggota", nik_ktp: null, nik_kk: null, nomor_hp: null };

function usernameToEmail(username: string) { return `${username.trim().toLowerCase()}@kas-bendungan.id`; }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let mounted = true;
    const loadProfile = async (currentUser: User | null) => {
      if (!mounted) return;
      setUser(currentUser);
      if (!currentUser) { setProfile(null); setIsGuest(false); setLoading(false); return; }
      if (currentUser.is_anonymous) { setProfile(guestProfile); setIsGuest(true); setLoading(false); return; }
      const { data } = await client.from("profiles").select("id, username, display_name, role, nik_ktp, nik_kk, nomor_hp").eq("id", currentUser.id).single();
      if (mounted) { setProfile((data as AppProfile | null) ?? null); setIsGuest(false); setLoading(false); }
    };
    void client.auth.getSession().then(({ data }) => loadProfile(data.session?.user ?? null));
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => { void loadProfile(session?.user ?? null); });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user, profile, loading,
    isGuest,
    signIn: async (username, password) => {
      if (!supabase) return { error: "Supabase belum dikonfigurasi." };
      const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
      return { error: error?.message ?? null };
    },
    enterGuest: async () => {
      if (!supabase) return { error: "Supabase belum dikonfigurasi." };
      const { error } = await supabase.auth.signInAnonymously();
      return { error: error?.message ?? null };
    },
    signOut: async () => { if (supabase) await supabase.auth.signOut(); },
    canEdit: !isGuest && profile?.role !== "anggota" && Boolean(profile),
    canManageAccounts: !isGuest && Boolean(profile),
    canCreateAccounts: !isGuest && (profile?.role === "developer" || profile?.role === "ketua" || profile?.role === "bendahara"),
    canEditAccounts: !isGuest && (profile?.role === "developer" || profile?.role === "ketua" || profile?.role === "bendahara"),
  }), [user, profile, loading, isGuest]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error("useAuth harus digunakan di dalam AuthProvider"); return context; }
export function roleLabel(role: Role | undefined) { return role === "developer" ? "Developer" : role === "ketua" ? "Ketua" : role === "bendahara" ? "Bendahara" : "Anggota"; }
