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
              <UIProvider>
                <div className="relative min-h-screen">
                  <ShutdownWatcher />
                  {children}
                  <GlobalChat />
                  <PlayerList />
                </div>
              </UIProvider>
            </FoundryProvider>
          </NotificationProvider>
        </ConfigProvider>
      </body>
    </html>
  );
}
