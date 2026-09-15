import type { Metadata } from "next";
import "./globals.css";
import SiteChrome from "@/components/site-chrome";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Kas Bendungan — Ruang Kas Warga",
  description: "Dashboard kas kampung Bendungan yang transparan dan mudah digunakan.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="id" className="h-full antialiased"><body><AuthProvider><SiteChrome>{children}</SiteChrome></AuthProvider></body></html>;
}
