import type { Metadata } from "next";
import { Noto_Sans_JP, Onest } from "next/font/google";
import "./globals.css";

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin"],
});

const kana = Noto_Sans_JP({
  variable: "--font-kana",
  weight: "300",
  preload: false,
});

export const metadata: Metadata = {
  title: "Mr Japa | Restaurante Japonês",
  description: "Mr Japa, restaurante japonês. Cardápio, pedidos online e atendimento pelo WhatsApp.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${onest.variable} ${kana.variable}`}>
      <body>{children}</body>
    </html>
  );
}
