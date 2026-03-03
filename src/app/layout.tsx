import type { Metadata } from "next";
import { Geist, Geist_Mono, Cinzel, Inter, IM_Fell_Double_Pica, Crimson_Pro } from "next/font/google";
import "./globals.css";

import ShutdownWatcher from "@/app/ui/components/ShutdownWatcher";
import { ConfigProvider } from "@/app/ui/context/ConfigContext";
import { NotificationProvider } from "@/app/ui/components/NotificationSystem";
import { FoundryProvider } from "@/app/ui/context/FoundryContext";
import { UIProvider } from "@/app/ui/context/UIContext";
import GlobalChat from "@/app/ui/components/GlobalChat";
import PlayerList from "@/app/ui/components/PlayerList";
import FloatingHUD from "@/app/ui/components/FloatingHUD";
import CombatHUD from "@/app/ui/components/Combat/CombatHUD";
import { JournalProvider } from "@/app/ui/context/JournalProvider";
import JournalBrowser from "@/app/ui/components/JournalBrowser";
import JournalModal from "@/app/ui/components/JournalModal";
import VideoPlaysinlineFix from "@/app/ui/components/VideoPlaysinlineFix";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  preload: false,
  display: "swap",
  fallback: ["system-ui", "arial"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
  display: "swap",
  fallback: ["monospace"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  preload: false,
  display: "swap",
  fallback: ["serif"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  preload: false,
  display: "swap",
  fallback: ["sans-serif"],
});

const imFell = IM_Fell_Double_Pica({
  weight: "400",
  variable: "--font-imfell",
  subsets: ["latin"],
  preload: false,
  display: "swap",
  fallback: ["serif"],
});

const crimson = Crimson_Pro({
  variable: "--font-crimson",
  subsets: ["latin"],
  preload: false,
  display: "swap",
  fallback: ["serif"],
});

export const metadata: Metadata = {
  title: "SheetDelver",
  description: "Modern Foundry VTT Actor Sheet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} ${inter.variable} ${imFell.variable} ${crimson.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <ConfigProvider>
          <NotificationProvider>
            <UIProvider>
              <FoundryProvider>
                <JournalProvider>
                  <VideoPlaysinlineFix />
                  <div className="relative min-h-screen">
                    <ShutdownWatcher />
                    {children}
                    <GlobalChat />
                    <PlayerList />
                    <FloatingHUD />
                    <CombatHUD />
                    <JournalBrowser />
                    <JournalModal />
                  </div>
                </JournalProvider>
              </FoundryProvider>
            </UIProvider>
          </NotificationProvider>
        </ConfigProvider>
      </body>
    </html>
  );
}
