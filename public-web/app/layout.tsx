import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpyReels Public Web Architecture",
  description: "Isolated Next.js rendering foundation for SpyReels public acquisition pages.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
