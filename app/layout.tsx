import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
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
 *
 * `<Toaster />` (`components/ui/sonner.tsx`) is mounted once here, globally
 * — first real consumer is `ventas-board.tsx`'s drag-and-drop error toast
 * (a failed `PATCH /api/ventas/[id]` reverts the optimistic move and surfaces
 * a `toast.error(...)`). Without a mounted `<Toaster/>` somewhere in the
 * tree, `sonner`'s `toast(...)` calls are silent no-ops (nothing renders
 * them) — this was previously missing app-wide.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`dark ${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
