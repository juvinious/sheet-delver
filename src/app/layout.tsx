import type { Metadata } from "next";
import { Geist, Geist_Mono, Cinzel, Inter, IM_Fell_Double_Pica, Crimson_Pro } from "next/font/google";
import "./globals.css";

import ShutdownWatcher from "@client/ui/components/ShutdownWatcher";
import { ConfigProvider } from "@client/ui/context/ConfigContext";
import { NotificationProvider } from "@client/ui/components/NotificationSystem";
import { FoundryProvider } from "@client/ui/context/FoundryContext";
import { UIProvider } from "@client/ui/context/UIContext";
import { SessionProvider } from "@client/ui/context/SessionContext";
import { ActorCombatProvider } from "@client/ui/context/ActorCombatContext";
import { RealtimeProvider } from "@client/ui/context/RealtimeContext";
import { ChatProvider } from "@client/ui/context/ChatContext";
import GlobalChat from "@client/ui/components/GlobalChat";
import PlayerList from "@client/ui/components/PlayerList";
import FloatingHUD from "@client/ui/components/FloatingHUD";
import CombatHUD from "@client/ui/components/Combat/CombatHUD";
import { JournalProvider } from "@client/ui/context/JournalProvider";
import JournalBrowser from "@client/ui/components/JournalBrowser";
import JournalModal from "@client/ui/components/JournalModal";
import VideoPlaysinlineFix from "@client/ui/components/VideoPlaysinlineFix";

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
              <SessionProvider>
                <RealtimeProvider>
                  <ActorCombatProvider>
                    <ChatProvider>
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
                    </ChatProvider>
                  </ActorCombatProvider>
                </RealtimeProvider>
              </SessionProvider>
            </UIProvider>
          </NotificationProvider>
        </ConfigProvider>
      </body>
    </html>
  );
}
