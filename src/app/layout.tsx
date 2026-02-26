import type { Metadata } from "next";
import { Geist, Geist_Mono, Cinzel } from "next/font/google";
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
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
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
        className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} antialiased`}
        suppressHydrationWarning
      >
        <ConfigProvider>
          <NotificationProvider>
            <FoundryProvider>
              <JournalProvider>
                <UIProvider>
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
                </UIProvider>
              </JournalProvider>
            </FoundryProvider>
          </NotificationProvider>
        </ConfigProvider>
      </body>
    </html>
  );
}
