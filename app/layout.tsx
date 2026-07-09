import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Panel de Negocio",
  description: "Gestion de clientes, facturas y pagos.",
};

/**
 * `dark` is forced on `<html>` unconditionally — this app ships one dark
 * theme only, no light/dark toggle (not requested). `app/globals.css`'s
 * `@custom-variant dark (&:is(.dark *))` makes every `.dark`-scoped CSS
 * variable active for the whole tree from here down. The one deliberate
 * exception is `app/(print)/layout.tsx`, which re-scopes its own subtree
 * back to the light palette via a `.light` class, since printable
 * comprobantes must stay light/high-contrast on paper regardless of the
 * on-screen theme.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
