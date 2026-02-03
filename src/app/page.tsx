import { loadConfig } from '@/core/config';
import ClientPage from '@/app/ui/components/ClientPage';
import { SetupScraper } from '@/core/foundry/SetupScraper';
// import { SetupToken } from '@/core/security/SetupToken';
// import { redirect } from 'next/navigation';

export default async function Page() {
    const config = await loadConfig();
    const initialUrl = config?.foundry.url || '';

    // Check if setup is required
    const cache = await SetupScraper.loadCache();
    const hasCache = cache.currentWorldId && cache.worlds[cache.currentWorldId];

    if (!hasCache) {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center font-sans p-8">
                <h1 className="text-4xl font-bold mb-4 text-amber-500" style={{ fontFamily: 'serif' }}>SheetDelver</h1>
                <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 p-8 rounded-xl shadow-2xl text-center">
                    <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold mb-2">Configuration Required</h2>
                    <p className="text-neutral-400 mb-6 text-sm leading-relaxed">
                        SheetDelver has not been configured for a Foundry world yet.
                    </p>
                    <div className="bg-black/50 p-4 rounded-lg border border-white/5 font-mono text-xs text-left mb-6">
                        <p className="text-neutral-500 mb-2"># Run the setup tool in your terminal:</p>
                        <p className="text-green-400">$ npm run admin</p>
                        <p className="text-neutral-500 mt-2"># Then select option:</p>
                        <p className="text-yellow-400">[C] Configure/Setup</p>
                    </div>
                    <p className="text-xs text-neutral-600 mb-6">
                        Refresh this page once setup is complete.
                    </p>

                    <div className="flex justify-center gap-4">
                        <a
                            href="https://github.com/juvinious/sheet-delver"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity text-sm font-mono text-neutral-500"
                        >
                            <img src="https://img.shields.io/badge/github-repo-blue?logo=github" alt="GitHub Repo" className="opacity-80" />
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    return <ClientPage initialUrl={initialUrl} />;
}
