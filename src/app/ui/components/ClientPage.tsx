'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import PlayerList from './PlayerList';
import { SharedContentModal } from './SharedContentModal';
import { useNotifications, NotificationContainer } from './NotificationSystem';
import SystemTools from './SystemTools';
import LoadingModal from './LoadingModal';
import { SystemInfo } from '@/shared/interfaces';
import { logger, LOG_LEVEL } from '../logger';
import { Users, ChevronDown, ChevronRight } from 'lucide-react';

interface User {
  id?: string;
  _id?: string;
  name: string;
  active?: boolean;
  isGM?: boolean;
  color?: string;
  characterName?: string;
}

interface ClientPageProps {
  initialUrl: string;
}

export default function ClientPage({ initialUrl }: ClientPageProps) {
  const [step, setStep] = useState<'init' | 'reconnecting' | 'login' | 'dashboard' | 'setup' | 'startup' | 'authenticating'>('init');
  const { notifications, addNotification, removeNotification } = useNotifications();

  // Dashboard UI State
  const [isReadOnlyCollapsed, setIsReadOnlyCollapsed] = useState(true);

  // Debug Configuration
  // We maintain local state for reactivity if needed, but main logic drives the singleton
  const [debugLevel, setDebugLevel] = useState(LOG_LEVEL.INFO);

  const setStepWithLog = (newStep: typeof step, origin: string, reason?: string) => {
    // Demoted to DEBUG (Level 4) per user request
    const timestamp = new Date().toISOString();
    logger.debug(`[STATE CHANGE] ${timestamp} | ${step} -> ${newStep} | Origin: ${origin}${reason ? ` | Reason: ${reason}` : ''}`);
    setStep(newStep);
  };

  // Connect State
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);

  // Session State
  const [token, setTokenState] = useState<string | null>(null);

  const setToken = (newToken: string | null) => {
    setTokenState(newToken);
    if (newToken) {
      sessionStorage.setItem('sheet-delver-token', newToken);
    } else {
      sessionStorage.removeItem('sheet-delver-token');
    }
  };

  // Load token on mount
  useEffect(() => {
    const stored = sessionStorage.getItem('sheet-delver-token');
    if (stored) setTokenState(stored);
  }, []);

  // Login State
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [password, setPassword] = useState('');
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [appVersion, setAppVersion] = useState('');
  const [, setActors] = useState<any[]>([]); // "All" or "Owned" fallback
  const [ownedActors, setOwnedActors] = useState<any[]>([]);
  const [readOnlyActors, setReadOnlyActors] = useState<any[]>([]);
  const [loginMessage, setLoginMessage] = useState('');

  const handleLogin = async () => {
    setLoading(true);
    setLoginMessage('Logging in...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 45000); // 45 seconds to match backend 30s + buffer

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: selectedUser, password }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await res.json();

      if (data.success) {
        setToken(data.token);
        setStepWithLog('authenticating', 'handleLogin', 'Login successful, waiting for backend session');
        setLoading(false);
        setLoginMessage('');
      } else {
        setLoading(false);
        setLoginMessage('');
        setPassword(''); // Clear password on failure
        addNotification('Login failed: ' + data.error, 'error');
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      setLoading(false);
      setLoginMessage('');
      setPassword('');

      if (e.name === 'AbortError') {
        addNotification('Login timed out. Please try again.', 'error');
      } else {
        addNotification('Error: ' + e.message, 'error');
      }
    }
  };

  const handleLogout = async () => {
    logger.info('[handleLogout] Initiating logout sequence...');
    try {
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // CRITICAL: Set step to login BEFORE clearing token
      setStepWithLog('login', 'handleLogout', 'User logged out, transitioning to login');

      await fetch('/api/logout', { method: 'POST', headers });

      // Clear token and let state machine handle transition to login
      setToken(null);
      setSelectedUser('');
      setPassword('');
      setUsers(prev => prev.map(u => ({ ...u, active: false }))); // Optimistically clear status
    } catch (e: any) {
      logger.error('Logout error:', e);
      // Even if logout fails, clear local state
      setStepWithLog('login', 'handleLogout error', 'Logout failed, forcing login state');
      setToken(null);
      setSelectedUser('');
      setPassword('');
    }
  };

  // Theme Logic
  const defaultTheme = {
    bg: 'bg-slate-900',
    panelBg: 'bg-slate-800',
    text: 'text-slate-100',
    accent: 'text-amber-500',
    button: 'bg-amber-600 hover:bg-amber-700',
    headerFont: 'font-sans font-bold',
    input: 'bg-slate-700 border-slate-600 focus:border-amber-500',
    success: 'bg-green-600 hover:bg-green-700'
  };

  const theme = system?.theme || defaultTheme;

  // Resolve background image
  const bgSrc = (step === 'startup' || step === 'setup') ? null : (system?.worldBackground || system?.background);
  const bgStyle = bgSrc
    ? {
      backgroundImage: `url(${bgSrc.startsWith('http') ? bgSrc : `${url}/${bgSrc}`})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    }
    : {};

  // Auto-Connect Effect
  useEffect(() => {
    const determineStep = (data: any, currentStep: string) => {
      const status = data.system?.status;
      const isAuthenticated = data.isAuthenticated || false;

      // 1. Are we in setup? -> Show setup screen
      if (status !== 'active') return 'setup';

      // 2. If we're authenticating, stay there until backend confirms
      if (currentStep === 'authenticating') {
        if (isAuthenticated) return 'dashboard';
        return 'authenticating';
      }

      // 3. Check if world data is complete before showing login
      const worldTitle = data.system?.worldTitle;
      const hasCompleteWorldData = worldTitle && worldTitle !== 'Reconnecting...';

      if (!hasCompleteWorldData) return 'startup';

      // 4. Authenticated? -> Show dashboard, otherwise login
      if (isAuthenticated) return 'dashboard';
      else return 'login';
    };

    const checkConfig = async () => {
      if (step === 'authenticating') return;

      try {
        setLoading(true);
        setLoginMessage('Connecting to server...');

        const headers: any = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/status', { headers });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);

        const data = await res.json();

        // Update Debug Level from Server Config
        if (data.debug?.level !== undefined) {
          setDebugLevel(data.debug.level);
          logger.setLevel(data.debug.level);
        }

        if (data.connected && data.system) {
          setSystem(data.system);
          setUrl(data.url);
          setUsers((data.users || []) as User[]);

          // Apply Strict Logic
          const targetStep = determineStep(data, step);
          setStepWithLog(targetStep as any, 'checkConfig polling', `Determined step: ${targetStep}`);

          // Trigger fetchActors if transitioning to dashboard
          if (targetStep === 'dashboard') fetchActors();

        } else {
          setStepWithLog('setup', 'checkConfig polling', 'Not connected or no system data');
        }

        if (data.appVersion) setAppVersion(data.appVersion);

      } catch (error: any) {
        if (error.message?.includes('Failed to fetch') || error.message?.includes('500')) {
          setLoginMessage('Server is starting up, please wait...');
          setTimeout(() => {
            if (token !== null) checkConfig();
          }, 2000);
        } else {
          setStepWithLog('setup', 'checkConfig error handler', error.message);
          setLoading(false);
          setLoginMessage('');
        }
      } finally {
        if (!loginMessage.includes('starting up')) {
          setLoading(false);
          setLoginMessage('');
        }
      }
    };
    checkConfig();

  }, [token]);

  const fetchActors = useCallback(async () => {
    // We cannot block on loading because this might be called during the initial load sequence
    // explicitly to populate data for the dashboard transition.
    logger.debug('[fetchActors] Starting fetch...');
    try {
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/actors', { headers });

      if (res.status === 401) return;

      const data = await res.json();
      logger.debug('[fetchActors] Data received:', {
        actors: data.actors?.length,
        owned: data.ownedActors?.length,
        readOnly: data.readOnlyActors?.length
      });

      if (data.ownedActors || data.actors) {
        setActors(data.actors || []);
        setOwnedActors(data.ownedActors || data.actors || []);
        setReadOnlyActors(data.readOnlyActors || []);
      }
    } catch (error: any) {
      logger.error('Fetch actors failed:', error.message);
    }
  }, [loading, token, debugLevel]);

  // Polling for System State Changes
  useEffect(() => {
    const interval = setInterval(async () => {
      if (loading) return;
      try {
        const headers: any = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/session/connect', { headers, cache: 'no-store' });
        const data = await res.json();

        // Sync debug level on poll too
        if (data.debug?.level !== undefined && data.debug.level !== debugLevel) {
          setDebugLevel(data.debug.level);
          logger.setLevel(data.debug.level);
        }

        if (data.system) {
          if (data.system.status === 'active') {
            if (JSON.stringify(data.system) !== JSON.stringify(system)) {
              setSystem(data.system);
            }
            // Fix: Always sync users if they change, not just if empty
            // This ensures "Logged In" status updates when users log out
            if (data.users && JSON.stringify(data.users) !== JSON.stringify(users)) {
              logger.debug('[Polling] Updating users list:', data.users.length);

              // Setup change detection for notifications (only if we have an existing list)
              if (users.length > 0) {
                const oldUserMap = new Map(users.map(u => [u._id || u.id, u]));
                data.users.forEach((newUser: any) => {
                  const uid = newUser._id || newUser.id;
                  const oldUser = oldUserMap.get(uid);
                  if (oldUser) { // Matching user
                    if (!oldUser.active && newUser.active) {
                      addNotification(`${newUser.name} has logged in.`, 'success');
                    } else if (oldUser.active && !newUser.active) {
                      addNotification(`${newUser.name} has logged out.`, 'info');
                    }
                  }
                });
              }

              setUsers(data.users as User[]);
            }
          }

          const status = data.system.status;
          const isAuthenticated = data.isAuthenticated;
          let targetStep: string = 'setup';

          if (status !== 'active') {
            targetStep = 'setup';
          } else if (step === 'authenticating') {
            targetStep = isAuthenticated ? 'dashboard' : 'authenticating';
          } else {
            const worldTitle = data.system?.worldTitle;
            const hasCompleteWorldData = worldTitle && worldTitle !== 'Reconnecting...';

            if (!hasCompleteWorldData) targetStep = 'startup';
            else if (isAuthenticated) targetStep = 'dashboard';
            else targetStep = 'login';
          }

          if (step !== targetStep) {
            logger.debug(`[State] Transitioning ${step} -> ${targetStep}`);
            setStepWithLog(targetStep as any, 'session/connect polling', `Transitioning to ${targetStep}`);

            // Also reload actors on transition to dashboard
            if (targetStep === 'dashboard') fetchActors();
          }
        } else {
          if (step !== 'setup') setStepWithLog('setup', 'session/connect polling', 'No system data');
        }
      } catch {
        // Network error - ignore
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [step, loading, system, users, token, debugLevel]);

  const renderActorCard = (actor: any, index: number, clickable: boolean = true) => {
    return (
      <div
        key={actor.id}
        onClick={() => {
          if (!clickable) return;
          setLoading(true);
          setLoginMessage('Loading Codex...');
          window.location.href = `/actors/${actor.id}`;
        }}
        className={`
          ${theme.panelBg}/40 backdrop-blur-md p-4 rounded-xl shadow-lg border border-white/5 
          ${clickable ? 'hover:border-amber-500/50 hover:-translate-y-1 hover:shadow-2xl cursor-pointer' : 'cursor-default opacity-80'} 
          transition-all duration-300 block group animate-in fade-in slide-in-from-bottom-4
        `}
        style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
      >
        <div className="flex items-start gap-4">
          <div className="relative">
            <img
              src={actor.img ? (actor.img.startsWith('http') ? actor.img : `${url}/${actor.img}`) : `${url}/icons/svg/mystery-man.svg`}
              alt={actor.name}
              className="w-16 h-16 rounded-lg bg-black/40 object-cover border border-white/10 group-hover:border-amber-500/30 transition-colors"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `${url}/icons/svg/mystery-man.svg`;
              }}
            />
            {clickable && (
              <div className="absolute inset-0 bg-amber-500/0 group-hover:bg-amber-500/5 transition-colors rounded-lg"></div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-bold text-lg truncate ${theme.accent} ${clickable ? 'group-hover:brightness-125' : ''}`}>
              {actor.name}
            </h3>

            {system?.config?.actorCard?.subtext ? (
              <p className="opacity-60 text-sm mb-2 capitalize truncate">
                {system.config.actorCard.subtext
                  .map((path: string) => {
                    const rawVal = path.split('.').reduce((obj, key) => obj?.[key], actor);
                    return rawVal;
                  })
                  .filter(Boolean)
                  .join(' • ') || actor.type}
              </p>
            ) : (
              <p className="opacity-60 text-sm mb-2 capitalize truncate">{actor.type}</p>
            )}

            <div className="grid grid-cols-2 gap-2 text-sm">
              {actor.hp && (
                <div className="bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
                  <span className="opacity-50 text-[10px] uppercase tracking-tighter block">HP</span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono font-bold text-green-400">{actor.hp.value}</span>
                    <span className="opacity-30 text-xs">/ {actor.hp.max}</span>
                  </div>
                </div>
              )}
              {(actor.ac !== undefined) && (
                <div className="bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
                  <span className="opacity-50 text-[10px] uppercase tracking-tighter block">AC</span>
                  <span className="font-mono font-bold text-blue-400">{actor.ac}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <main
      className={`min-h-screen ${theme.bg} ${theme.text} p-8 font-sans transition-colors duration-500 flex flex-col`}
      style={bgStyle}
      data-step={step}
      data-loading={loading}
    >

      <div className="flex-1 w-full">

        {step === 'init' && (
          <div className="flex flex-col items-center justify-center min-h-[80vh] animate-in fade-in duration-700">
            <h1 className={`text-6xl font-black tracking-tighter text-white mb-8`} style={{ fontFamily: 'var(--font-cinzel), serif' }}>
              SheetDelver
            </h1>
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-white/50 text-sm font-mono tracking-widest uppercase">Initializing</p>
            </div>
          </div>
        )}

        {step === 'authenticating' && (
          <div className="flex flex-col items-center justify-center min-h-[80vh] animate-in fade-in duration-700">
            <h1 className={`text-6xl font-black tracking-tighter text-white mb-8`} style={{ fontFamily: 'var(--font-cinzel), serif' }}>
              SheetDelver
            </h1>
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-white/50 text-sm font-mono tracking-widest uppercase">Authenticating...</p>
            </div>
          </div>
        )}

        {step === 'startup' && (
          <div className="flex flex-col items-center justify-center min-h-[80vh] animate-in fade-in duration-700">
            <h1 className={`text-6xl font-black tracking-tighter text-white mb-8`} style={{ fontFamily: 'var(--font-cinzel), serif' }}>
              SheetDelver
            </h1>
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-white ml-2 text-lg">World Starting...</p>
              <p className="text-white/30 text-xs font-mono tracking-widest uppercase">Please wait while the world launches</p>
            </div>
          </div>
        )}

        {
          step === 'login' && (
            <div className="flex flex-col-reverse md:flex-row gap-8 max-w-4xl mx-auto items-stretch md:items-start animate-in fade-in slide-in-from-bottom-4 duration-500 mt-10">

              {/* World Info Card */}
              <div className={`flex-1 ${theme.panelBg} p-6 rounded-lg shadow-lg border border-white/5`}>
                {system?.worldTitle && (
                  <h1 className={`text-4xl font-bold mb-4 ${theme.headerFont} text-amber-500 tracking-tight`}>
                    {system.worldTitle}
                  </h1>
                )}

                {system?.worldDescription && (
                  <div className="prose prose-invert prose-sm max-w-none opacity-80 mb-6"
                    dangerouslySetInnerHTML={{ __html: system.worldDescription }}
                  />
                )}

                <div className="grid grid-cols-2 gap-4 mt-auto pt-4 border-t border-white/10">
                  <div>
                    <label className="text-xs uppercase tracking-widest opacity-50 block mb-1">Next Session</label>
                    <div className="font-mono text-lg">
                      {system?.nextSession ? system.nextSession : <span className="opacity-30 italic">Not Scheduled</span>}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-widest opacity-50 block mb-1">Current Players</label>
                    <div className="font-mono text-lg flex items-center gap-2">
                      <span className="text-green-400">{system?.users?.active || 0}</span>
                      <span className="opacity-40">/</span>
                      <span>{system?.users?.total || 0}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Login Form */}
              <div className={`w-full md:w-96 ${theme.panelBg} p-6 rounded-lg shadow-lg border border-white/5`}>
                <h2 className={`text-xl mb-4 ${theme.headerFont}`}>Login</h2>
                <div className="space-y-4">
                  {users.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium mb-1 opacity-70">Player</label>
                      <select
                        value={selectedUser}
                        onChange={(e) => setSelectedUser(e.target.value)}
                        className={`w-full p-2 rounded border outline-none ${theme.input} appearance-none`}
                      >
                        <option value="" disabled>-- Select Player --</option>
                        {users.map((u: User, idx: number) => {
                          const isGamemaster = u.name === 'Gamemaster';
                          const isDisabled = u.active || isGamemaster;
                          return (
                            <option
                              key={u.name || idx}
                              value={u.name}
                              disabled={isDisabled}
                              className={`bg-neutral-900 text-white ${isDisabled ? 'text-white/30 bg-neutral-800' : ''}`}
                            >
                              {u.name} {u.active ? ' (Logged In)' : (isGamemaster ? ' (Restricted)' : '')}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  {users.length > 0 && (
                    <>
                      <div className="mb-6">
                        <label className="block text-sm font-medium mb-1 opacity-70">Password</label>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                          className={`w-full p-2 rounded border outline-none ${theme.input}`}
                          placeholder="••••••••"
                        />
                      </div>

                      <button
                        onClick={handleLogin}
                        disabled={loading || !selectedUser}
                        className={`
                          w-full py-2 px-4 rounded font-bold transition-all duration-200
                          ${loading || !selectedUser
                            ? 'bg-neutral-700 text-white/30 cursor-not-allowed'
                            : 'bg-green-700 hover:bg-green-600 text-white shadow-lg hover:shadow-green-900/20'}
                        `}
                      >
                        {loading ? 'Authenticating...' : 'Login'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        }

        {step === 'setup' && (
          <div className="flex flex-col items-center justify-center min-h-[80vh] text-center p-8 space-y-6 animate-in fade-in duration-700">
            <h1 className={`text-6xl font-black tracking-tighter text-white mb-2 underline decoration-amber-500 underline-offset-8 decoration-4`} style={{ fontFamily: 'var(--font-cinzel), serif' }}>
              SheetDelver
            </h1>
            <p className="text-xs font-mono opacity-40 mb-8">v{appVersion}</p>

            <div className="bg-black/50 p-8 rounded-xl border border-white/10 backdrop-blur-md max-w-lg shadow-2xl w-full">
              <h2 className="text-2xl font-bold text-amber-500 mb-4">No World Available</h2>
              <p className="text-lg opacity-80 mb-6 leading-relaxed">
                No world is available to login, please check back later.
              </p>

              <div className="flex justify-center gap-4">
                <a
                  href="https://github.com/juvinious/sheet-delver"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity text-sm font-mono"
                >
                  <img src="https://img.shields.io/badge/github-repo-blue?logo=github" alt="GitHub Repo" className="opacity-80" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Reconnecting Overlay */}
        {step === 'dashboard' && system?.status !== 'active' && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-500">
            <div className={`${theme.panelBg} ${theme.text} border-2 border-amber-500/50 p-8 rounded-xl shadow-2xl max-w-sm w-full mx-4 text-center transform scale-100 animate-in fade-in zoom-in duration-300`}>
              <div className="mb-4 flex justify-center">
                <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <h2 className="text-xl font-bold mb-2">Connection Lost</h2>
              <p className="text-slate-400 mb-6">Foundry is currently unreachable. Reconnecting...</p>
              <div className="text-xs font-mono py-1 px-3 bg-black/30 rounded inline-block text-slate-500 uppercase tracking-widest">
                CORE_STATUS: {system?.status || 'UNKNOWN'}
              </div>
            </div>
          </div>
        )}

        {
          step === 'dashboard' && (
            <div className="max-w-7xl mx-auto space-y-8 p-6 bg-black/60 rounded-xl backdrop-blur-sm border border-white/10">
              {/* Overlays */}
              <SharedContentModal token={token} foundryUrl={url} />

              {/* Header / Status */}
              <div className="flex justify-between items-center bg-black/40 p-4 rounded-lg border border-white/5">
                <div>
                  <h2 className={`text-2xl ${theme.headerFont} ${theme.accent}`}>
                    {system?.worldTitle || 'Dashboard'}
                  </h2>
                  <div className="flex flex-col md:flex-row md:items-center md:gap-2 text-xs opacity-50">
                    {system?.worldTitle && (
                      <>
                        <span className="font-bold tracking-widest uppercase">Dashboard</span>
                      </>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                      <span className="font-bold text-white">Connected as {users.find(u => (u as any).active)?.name || 'Unknown'}</span>
                      <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                      <span>{url}</span>
                    </div>
                  </div>
                </div>
              </div>


              {/* System Specific Tools (Modularized) */}
              {system?.id && (
                <SystemTools
                  systemId={system.id}
                  setLoading={setLoading}
                  setLoginMessage={setLoginMessage}
                  theme={theme}
                  token={token}
                />
              )}

              {/* Owned Actors */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h3 className={`text-xl font-bold uppercase tracking-widest opacity-80 ${theme.accent}`}>Your Characters</h3>
                  <div className="h-px flex-1 bg-white/10"></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {ownedActors.length === 0 && <p className="opacity-50 italic text-sm py-4">You don&apos;t own any characters in this world.</p>}
                  {ownedActors.map((actor, idx) => renderActorCard(actor, idx, true))}
                </div>
              </div>

              {/* Read Only Actors */}
              {readOnlyActors.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => setIsReadOnlyCollapsed(!isReadOnlyCollapsed)}
                    className="flex items-center gap-3 mb-4 group w-full text-left"
                  >
                    {isReadOnlyCollapsed ? (
                      <div className="p-1 rounded bg-white/5 group-hover:bg-white/10 transition-colors">
                        <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-white" />
                      </div>
                    ) : (
                      <div className="p-1 rounded bg-white/5 group-hover:bg-white/10 transition-colors">
                        <ChevronDown className="w-4 h-4 text-neutral-400 group-hover:text-white" />
                      </div>
                    )}
                    <h3 className="text-xl font-bold uppercase tracking-widest opacity-40 text-neutral-400 group-hover:opacity-80 transition-opacity">
                      Other Characters (Read Only)
                    </h3>
                    <div className="h-px flex-1 bg-white/10 group-hover:bg-white/20 transition-colors"></div>
                  </button>

                  {!isReadOnlyCollapsed && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in slide-in-from-top-2 fade-in duration-300">
                      {readOnlyActors.map((actor, idx) => renderActorCard(actor, ownedActors.length + idx, false))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        }

      </div>

      {/* Footer Info Box (Relative Flow) */}
      <div className="w-full max-w-7xl mx-auto mt-12 bg-black/80 backdrop-blur-md p-6 rounded-xl border border-white/10 text-center md:text-right shadow-2xl">
        <div className="text-4xl font-black tracking-tighter text-white mb-2 underline decoration-amber-500 underline-offset-8 decoration-4" style={{ fontFamily: 'var(--font-cinzel), serif' }}>
          SheetDelver
        </div>
        {system && step !== 'setup' && step !== 'startup' && step !== 'init' && (
          <div className={`text-sm font-bold tracking-widest opacity-80 mb-2 ${theme.accent}`}>
            {system.title.toUpperCase()} ({system.version.toString().toUpperCase()})
          </div>
        )}
        <div className="text-[10px] opacity-30 font-mono tracking-wide mb-4">
          v{appVersion}
        </div>

        <div className="flex justify-center md:justify-end gap-4">
          <a
            href="https://github.com/juvinious/sheet-delver"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity text-sm font-mono"
          >
            <img src="https://img.shields.io/badge/github-repo-blue?logo=github" alt="GitHub Repo" className="opacity-80" />
          </a>
        </div>
      </div>

      {/* Persistent Player List when logged in */}
      {(step === 'dashboard') && <PlayerList users={users} onLogout={handleLogout} />}

      <NotificationContainer notifications={notifications} removeNotification={removeNotification} />

      {/* Loading Overlay */}
      <LoadingModal message={loginMessage} visible={loading && !!loginMessage} />
    </main >
  );
}
