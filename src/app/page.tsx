import { loadConfig } from '@/lib/config';
import ClientPage from '@/components/ClientPage';

export default async function Page() {
    const config = await loadConfig();
    const initialUrl = config?.foundry.url || '';
    return <ClientPage initialUrl={initialUrl} />;
}
