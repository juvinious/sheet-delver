import { loadConfig } from '@/lib/config';
import ClientPage from '@/components/ClientPage';
import { SetupScraper } from '@/lib/foundry/SetupScraper';
import { SetupToken } from '@/lib/security/SetupToken';
import { redirect } from 'next/navigation';

export default async function Page() {
    const config = await loadConfig();
    const initialUrl = config?.foundry.url || '';

    // Check if setup is required
    const cache = await SetupScraper.loadCache();
    const hasCache = cache.currentWorldId && cache.worlds[cache.currentWorldId];

    if (!hasCache) {
        // Generate setup token and redirect
        const token = SetupToken.generate();
        redirect(`/setup?token=${token}`);
    }

    return <ClientPage initialUrl={initialUrl} />;
}
