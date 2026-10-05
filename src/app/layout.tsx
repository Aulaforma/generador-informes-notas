import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { GradesProvider } from "@/context/GradesContext";
import { AuthProvider } from "@/context/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Libreta de Notas | Liceo Andrés Alcázar de Tucapel",
  description: "Sistema de gestión interna de calificaciones escolares - Panel UTP",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
        <AuthProvider>
          <AuthGuard>
            <GradesProvider>{children}</GradesProvider>
          </AuthGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
