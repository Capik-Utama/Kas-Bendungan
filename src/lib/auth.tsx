"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export const ROLES = ["developer", "ketua", "bendahara", "anggota"] as const;
export type Role = (typeof ROLES)[number];

export type AppProfile = { id: string; username: string; display_name: string; role: Role };

type AuthContextValue = {
  user: User | null;
  profile: AppProfile | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  canEdit: boolean;
  canManageAccounts: boolean;
  canCreateAccounts: boolean;
  canEditAccounts: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@kas-bendungan.id`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    const client = supabase;
    let mounted = true;
    const loadProfile = async (currentUser: User | null) => {
      if (!mounted) return;
      setUser(currentUser);
      if (!currentUser) { setProfile(null); setLoading(false); return; }
      const { data } = await client.from("profiles").select("id, username, display_name, role").eq("id", currentUser.id).single();
      if (mounted) { setProfile((data as AppProfile | null) ?? null); setLoading(false); }
    };
    void client.auth.getSession().then(({ data }) => loadProfile(data.session?.user ?? null));
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => { void loadProfile(session?.user ?? null); });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    profile,
    loading,
    signIn: async (username, password) => {
      if (!supabase) return { error: "Supabase belum dikonfigurasi." };
      const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
      return { error: error?.message ?? null };
    },
    signOut: async () => { if (supabase) await supabase.auth.signOut(); },
    canEdit: profile?.role !== "anggota" && Boolean(profile),
    canManageAccounts: Boolean(profile),
    canCreateAccounts: profile?.role === "developer" || profile?.role === "ketua",
    canEditAccounts: profile?.role === "developer" || profile?.role === "ketua" || profile?.role === "bendahara",
  }), [user, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth harus digunakan di dalam AuthProvider");
  return context;
}

export function roleLabel(role: Role | undefined) {
  return role === "developer" ? "Developer" : role === "ketua" ? "Ketua" : role === "bendahara" ? "Bendahara" : "Anggota";
}
