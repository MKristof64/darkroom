import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ország–Város • After Dark",
  description: "7 téma. Egy betű. Egy társaság. Csatlakozz a hatjegyű kóddal, és induljon a kör!",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hu">
      <body className="antialiased">{children}</body>
    </html>
  );
}
