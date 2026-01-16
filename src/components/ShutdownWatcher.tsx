'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function ShutdownWatcher() {
    const router = useRouter();
    const pathname = usePathname();
    const [shutdownDetected, setShutdownDetected] = useState(false);
    const [countDown, setCountDown] = useState(3);

    // We use a ref to track shutdown state inside the interval closure without needing to reset the interval
    const shutdownRef = useRef(false);

    useEffect(() => {
        // Do not run on the root page if we are already in setup mode (handled by ClientPage)
        // Actually, ClientPage handles the setup UI, so if we are on '/', we might want to let ClientPage handle it?
        // But the user asked for "application wide".
        // If ClientPage is actively handling "Setup" step, we don't need to double-redirect.
        // However, if we are on '/' in 'dashboard' mode, we DO want to see the warning.
        // So always running is safer, but we should check if we are ALREADY on setup?
        // ClientPage's setup view is not a separate route, it's state-based.

        const interval = setInterval(async () => {
            // If we are on the home page, ClientPage handles the setup UI.
            // If we are on the home page, we only want to trigger if we are currently "In Game" (Dashboard/Login).
            // This prevents an infinite loop where we reload, land on Setup (not logged in), and then reload again.
            // If we are on the home page, we check the data-step attribute.
            // If the app is already in 'setup' or 'connect' mode, we are already handling the "No World" state.
            // We only want to trigger if we remain in 'dashboard' or 'login' mode while the world is stopped.
            if (pathname === '/') {
                const currentStep = document.querySelector('main')?.getAttribute('data-step');
                if (currentStep === 'setup' || currentStep === 'connect') return;
            }

            // If already shutting down, don't keep polling
            if (shutdownRef.current) return;

            try {
                const res = await fetch('/api/session/connect');
                const data = await res.json();

                if (data.system && data.system.id === 'setup') {
                    // Check if we are already aware (should be caught by shutdownRef, but double check)
                    if (!shutdownRef.current) {
                        console.log('[ShutdownWatcher] World Shutdown detected. Starting countdown.');
                        shutdownRef.current = true;
                        setShutdownDetected(true);
                        setCountDown(3);
                    }
                }
            } catch (e) {
                // Ignore transient errors
            }
        }, 2000); // Poll every 2 seconds

        return () => clearInterval(interval);
    }, []);

    // Countdown Effect
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (shutdownDetected && countDown > 0) {
            timer = setTimeout(() => setCountDown(c => c - 1), 1000);
        } else if (shutdownDetected && countDown === 0) {
            console.log('[ShutdownWatcher] Countdown complete. Redirecting to home/setup.');
            shutdownRef.current = false; // Reset for next time (though we are redirecting)
            setShutdownDetected(false);

            // Force reload/redirect to root to ensure ClientPage picks up the 'setup' state from fresh fetch
            window.location.href = '/';
        }
        return () => clearTimeout(timer);
    }, [shutdownDetected, countDown, router]);

    if (!shutdownDetected) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="text-center space-y-4 p-8 border border-white/10 rounded-xl bg-neutral-900/50 shadow-2xl max-w-md mx-auto">
                <div className={`text-amber-500 text-6xl font-black font-mono animate-pulse`}>
                    {countDown}
                </div>
                <h2 className="text-2xl font-bold text-white tracking-tight">World Shutdown Detected</h2>
                <p className="text-white/60">The Foundry world has been stopped. Returning to start screen...</p>
            </div>
        </div>
    );
}
