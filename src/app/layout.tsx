import type { Metadata } from "next";
import "./globals.css";
import SiteChrome from "@/components/site-chrome";

export const metadata: Metadata = {
  title: "Kas Bendungan — Ruang Kas Warga",
  description: "Dashboard kas kampung Bendungan yang transparan dan mudah digunakan.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <body><SiteChrome>{children}</SiteChrome></body>
    </html>
  );
}
