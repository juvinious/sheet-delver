import { io, Socket } from 'socket.io-client';
import { logger } from '../../logger';
import { FoundryConfig } from '../types';
import { EventEmitter } from 'events';

export abstract class SocketBase extends EventEmitter {
    protected socket: Socket | null = null;
    protected cookieMap = new Map<string, string>();
    protected sessionCookie: string | null = null;
    public isSocketConnected: boolean = false;
    protected config: FoundryConfig;
    protected sharedContent: any | null = null;

    constructor(config: FoundryConfig) {
        super();
        this.config = config;
    }

    protected getBaseUrl(): string {
        if (this.config.url) {
            return this.config.url.endsWith('/') ? this.config.url.slice(0, -1) : this.config.url;
        }
        if (this.config.host) {
            const protocol = this.config.protocol || 'http';
            const port = this.config.port ? `:${this.config.port}` : '';
            return `${protocol}://${this.config.host}${port}`;
        }
        throw new Error("Foundry URL or Host not configured");
    }

    protected updateCookies(headerVal: string | string[] | null | undefined) {
        if (!headerVal) return;
        const cookies = Array.isArray(headerVal) ? headerVal : [headerVal];

        cookies.forEach(c => {
            // Split multiple cookies if they are comma separated (common in simple fetch)
            const parts = c.split(/,(?=\s*\w+=)/g);
            parts.forEach(part => {
                const [pair] = part.split(';');
                if (pair.includes('=')) {
                    const [key, value] = pair.split('=');
                    this.cookieMap.set(key.trim(), value.trim());
                }
            });
        });

        // Update the main session string
        this.sessionCookie = Array.from(this.cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    }

    protected async performHandshake(baseUrl: string): Promise<{ csrfToken: string | null, isSetupMatch: boolean, users: any[] }> {
        logger.info(`[${this.constructor.name}] Performing Handshake (GET /join)...`);
        const joinResponse = await fetch(`${baseUrl}/join`, {
            headers: { 'User-Agent': 'SheetDelver/1.0' }
        });

        if (!joinResponse.ok) {
            throw new Error(`Handshake failed with status ${joinResponse.status}`);
        }

        const setCookie = typeof (joinResponse.headers as any).getSetCookie === 'function'
            ? (joinResponse.headers as any).getSetCookie()
            : joinResponse.headers.get('set-cookie');
        this.updateCookies(setCookie);

        const html = await joinResponse.text();

        // Check for Setup Mode (Redirect or HTML ID)
        const isSetup = joinResponse.url.includes('/setup') || html.includes('id="setup"');

        // Parse CSRF
        let csrfToken: string | null = null;
        const csrfMatch = html.match(/csrfToken["']\s*:\s*["']([^"']+)["']/) ||
            html.match(/name="csrf-token" content="(.*?)"/);
        if (csrfMatch) csrfToken = csrfMatch[1];
        logger.debug(`[${this.constructor.name}] CSRF Match: ${csrfToken ? 'Success' : 'Failed'}`);

        // Scrape Users as Fallback
        const users: any[] = [];
        // Support attributes like 'disabled' or different quotes
        const userRegex = /<option\s+value=["']([^"']+)["'][^>]*>([^<]+)<\/option>/gi;
        let match;
        while ((match = userRegex.exec(html)) !== null) {
            users.push({ _id: match[1], name: match[2].trim() });
        }
        logger.debug(`[${this.constructor.name}] Scraped ${users.length} users from /join HTML.`);

        return { csrfToken, isSetupMatch: isSetup, users };
    }

    protected async performLogin(baseUrl: string, userId: string, csrfToken: string | null): Promise<void> {
        logger.info(`[${this.constructor.name}] Performing POST Login (User: ${userId})...`);
        const payload = {
            userid: userId,
            password: this.config.password || '',
            action: 'join',
            'csrf-token': csrfToken
        };

        const loginResponse = await fetch(`${baseUrl}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': this.sessionCookie || '',
                'User-Agent': 'SheetDelver/1.0'
            },
            body: JSON.stringify(payload),
            redirect: 'manual'
        });

        if (loginResponse.status !== 200 && loginResponse.status !== 302) {
            const body = await loginResponse.text();
            logger.error(`[${this.constructor.name}] Login failed (${loginResponse.status}): ${body.substring(0, 200)}`);
            throw new Error(`Login failed with status ${loginResponse.status}: ${body.substring(0, 200)}`);
        }

        const setCookie = typeof (loginResponse.headers as any).getSetCookie === 'function'
            ? (loginResponse.headers as any).getSetCookie()
            : loginResponse.headers.get('set-cookie');

        logger.debug(`[${this.constructor.name}] Set-Cookie from login: ${JSON.stringify(setCookie)}`);
        this.updateCookies(setCookie);
        logger.info(`[${this.constructor.name}] Login Outcome: ${loginResponse.status}. Cookie Map Size: ${this.cookieMap.size}`);
    }

    protected getSessionId(): string | undefined {
        if (!this.sessionCookie) return undefined;
        const parts = this.sessionCookie.split(';');
        for (const part of parts) {
            const [key, value] = part.trim().split('=');
            if (key === 'session' || key === 'foundry') {
                return value;
            }
        }
        return undefined;
    }

    protected async probeWorldState(baseUrl: string): Promise<any> {
        logger.info(`[${this.constructor.name}] Probing world state (Socket + API)...`);

        let discoveryResult: any = null;

        // 1. Socket Probe Logic
        const probeSocket = async (): Promise<void> => {
            const guestCookie = this.sessionCookie || '';
            const sessionId = this.getSessionId();

            return new Promise<void>((resolve) => {
                const guestSocket = io(baseUrl, {
                    path: '/socket.io',
                    transports: ['websocket'],
                    reconnection: false,
                    query: sessionId ? { session: sessionId } : {},
                    auth: sessionId ? { session: sessionId } : {},
                    extraHeaders: { 'Cookie': guestCookie, 'User-Agent': 'SheetDelver/1.0' },
                    transportOptions: { websocket: { extraHeaders: { 'Cookie': guestCookie } } }
                });

                const t = setTimeout(() => {
                    guestSocket.disconnect();
                    resolve();
                }, 10000);

                guestSocket.on('connect', () => {
                    logger.debug(`[${this.constructor.name}] Guest Socket Probe Connected.`);

                    // Try getJoinData first (Legacy/v12)
                    guestSocket.emit('getJoinData', (result: any) => {
                        if (result && result.world) {
                            discoveryResult = result;
                            clearTimeout(t);
                            guestSocket.disconnect();
                            resolve();
                        } else {
                            // Try 'world' (v13)
                            guestSocket.emit('world', (worldResult: any) => {
                                clearTimeout(t);
                                if (worldResult && worldResult.world) {
                                    discoveryResult = worldResult;
                                } else {
                                    // Try status fallback
                                    guestSocket.emit('getWorldStatus', (status: boolean) => {
                                        if (status) {
                                            discoveryResult = { world: { title: 'Authenticating...' }, status: 'active' };
                                        }
                                    });
                                }
                                guestSocket.disconnect();
                                resolve();
                            });
                        }
                    });
                });

                guestSocket.on('connect_error', (err) => {
                    logger.debug(`[${this.constructor.name}] Guest Socket Probe Error: ${err.message}`);
                    clearTimeout(t);
                    guestSocket.disconnect();
                    resolve();
                });
            });
        };

        // 2. API Probe Logic (/api/status)
        const probeApi = async (): Promise<void> => {
            try {
                const statusRes = await fetch(`${baseUrl}/api/status`);
                if (statusRes.ok) {
                    const status = await statusRes.json();
                    if (status.world) {
                        logger.info(`[${this.constructor.name}] API Probe Success: ${status.world}`);
                        if (!discoveryResult) {
                            discoveryResult = {
                                world: { id: status.world, title: status.world },
                                system: { id: status.system },
                                version: status.version,
                                status: status.active ? 'active' : 'offline'
                            };
                        }
                    }
                }
            } catch (e) {
                logger.debug(`[${this.constructor.name}] API Probe Failed: ${e}`);
            }
        };

        await Promise.all([probeSocket(), probeApi()]);
        return discoveryResult;
    }

    public disconnect() {
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
            this.socket = null;
        }
        this.isSocketConnected = false;
        logger.info(`[${this.constructor.name}] Socket disconnected.`);
    }

    public get isConnected(): boolean {
        return this.isSocketConnected;
    }

    public getSharedContent() {
        return this.sharedContent;
    }

    protected setupSharedContentListeners(socket: Socket) {
        socket.on('shareImage', (data: any) => {
            logger.info(`[${this.constructor.name}] Received shared image: ${data.image}`);
            this.sharedContent = {
                type: 'image',
                data: {
                    url: data.image,
                    title: data.title
                },
                timestamp: Date.now()
            };
        });

        socket.on('showEntry', (uuid: string, ...args: any[]) => {
            logger.info(`[${this.constructor.name}] Received shared entry: ${uuid}`);
            const parts = uuid.split('.');
            if (parts.length >= 2 && parts[0] === 'JournalEntry') {
                this.sharedContent = {
                    type: 'journal',
                    data: {
                        id: parts[1],
                        uuid: uuid
                    },
                    timestamp: Date.now()
                };
            }
        });
    }

    abstract connect(): Promise<void>;
}
