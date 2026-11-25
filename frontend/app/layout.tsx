import type { Metadata } from "next";
import AppHeader from "./_components/app-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panel de Inventario",
  description: "Gestiona productos y ventas conectados a tu backend con Prisma.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
