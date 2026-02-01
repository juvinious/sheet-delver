'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SetupPage() {
    const router = useRouter();
    const [token, setToken] = useState<string | null>(null);
    const [sessionCookie, setSessionCookie] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [scrapedData, setScrapedData] = useState<any>(null);

    useEffect(() => {
        // Get token from URL query params
        const params = new URLSearchParams(window.location.search);
        const tokenParam = params.get('token');

        if (!tokenParam) {
            setError('No setup token provided. Check server console for the setup URL.');
        } else {
            setToken(tokenParam);
        }
    }, []);

    const handleScrape = async () => {
        if (!token) {
            setError('No valid token');
            return;
        }

        if (!sessionCookie.trim()) {
            setError('Please paste your session cookie');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/setup/scrape?token=${token}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ sessionCookie: sessionCookie.trim() })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to scrape data');
            }

            setScrapedData(data.data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        // Logout the socket connection user to force login screen
        try {
            await fetch('/api/session/logout', { method: 'POST' });
        } catch (e) {
            console.error('Logout failed:', e);
        }

        // Redirect to main page after successful setup
        router.push('/');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white p-8">
            <div className="max-w-2xl mx-auto">
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-8 shadow-2xl">
                    <h1 className="text-3xl font-bold mb-2">SheetDelver Setup</h1>
                    <p className="text-gray-400 mb-8">Configure your Foundry VTT connection</p>

                    {!scrapedData ? (
                        <>
                            <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 mb-6">
                                <h2 className="font-semibold mb-3">📋 How to Get Your Session Cookie</h2>
                                <ol className="list-decimal list-inside space-y-3 text-sm text-gray-300">
                                    <li>
                                        <strong>Log in to Foundry VTT</strong> in another browser tab
                                        <div className="ml-6 mt-1 text-gray-400">
                                            Navigate to your Foundry instance and log in as your user
                                        </div>
                                    </li>
                                    <li>
                                        <strong>Open DevTools</strong>
                                        <div className="ml-6 mt-1 text-gray-400">
                                            Press <kbd className="bg-gray-700 px-2 py-0.5 rounded">F12</kbd> or right-click → Inspect
                                        </div>
                                    </li>
                                    <li>
                                        <strong>Go to Application tab</strong>
                                        <div className="ml-6 mt-1 text-gray-400">
                                            In DevTools top menu (if you don&apos;t see it, click <kbd className="bg-gray-700 px-2 py-0.5 rounded">&gt;&gt;</kbd>)
                                        </div>
                                    </li>
                                    <li>
                                        <strong>Find Cookies</strong>
                                        <div className="ml-6 mt-1 text-gray-400">
                                            Left sidebar → Expand &quot;Cookies&quot; → Click your Foundry URL
                                        </div>
                                    </li>
                                    <li>
                                        <strong>Copy the session cookie</strong>
                                        <div className="ml-6 mt-1 text-gray-400">
                                            Look for a cookie named <code className="bg-gray-700 px-1 rounded">session</code> or <code className="bg-gray-700 px-1 rounded">foundry</code>
                                            <br />
                                            Copy the entire <strong>Value</strong> (long string starting with <code className="bg-gray-700 px-1 rounded">s%3A...</code>)
                                        </div>
                                    </li>
                                    <li>
                                        <strong>Paste below</strong>
                                        <div className="ml-6 mt-1 text-gray-400">
                                            Format: <code className="bg-gray-700 px-1 rounded">session=s%3A...</code> or just the value itself
                                        </div>
                                    </li>
                                </ol>

                                <div className="mt-4 p-3 bg-gray-800/50 rounded border border-gray-700">
                                    <p className="text-xs text-gray-400">
                                        <strong>💡 Alternative:</strong> In DevTools → Network tab → Refresh page → Click any request →
                                        Request Headers → Copy entire <code className="bg-gray-700 px-1 rounded">Cookie:</code> line
                                    </p>
                                </div>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium mb-2">
                                    Session Cookie
                                </label>
                                <textarea
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    rows={4}
                                    placeholder="session=s%3A... or just paste the value"
                                    value={sessionCookie}
                                    onChange={(e) => setSessionCookie(e.target.value)}
                                    disabled={loading}
                                />
                            </div>

                            {error && (
                                <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
                                    <p className="text-red-300">{error}</p>
                                </div>
                            )}

                            <button
                                onClick={handleScrape}
                                disabled={loading || !token}
                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                            >
                                {loading ? 'Scraping...' : 'Scrape World Data'}
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 mb-6">
                                <h2 className="font-semibold mb-2">✅ Setup Complete!</h2>
                                <p className="text-sm text-gray-300">World data has been cached successfully.</p>
                            </div>

                            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-6">
                                <h3 className="font-semibold mb-3">Scraped Data:</h3>
                                <dl className="space-y-2 text-sm">
                                    <div>
                                        <dt className="text-gray-400">World:</dt>
                                        <dd className="font-mono">{scrapedData.worldTitle}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-gray-400">System:</dt>
                                        <dd className="font-mono">{scrapedData.systemId}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-gray-400">Background:</dt>
                                        <dd className="font-mono text-xs break-all">{scrapedData.backgroundUrl || 'None'}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-gray-400">Users:</dt>
                                        <dd>
                                            <ul className="list-disc list-inside">
                                                {scrapedData.users.map((u: any) => (
                                                    <li key={u._id} className="font-mono">
                                                        {u.name} <span className="text-gray-500">({u._id})</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </dd>
                                    </div>
                                </dl>
                            </div>

                            <button
                                onClick={handleConfirm}
                                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                            >
                                Continue to App
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
