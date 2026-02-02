'use client';

import { useState, useEffect, useCallback } from 'react';
import PlayerList from './PlayerList';
import { useNotifications, NotificationContainer } from './NotificationSystem';
import SystemTools from './SystemTools';
import LoadingModal from './LoadingModal';

interface User {
  id?: string;
  _id?: string;
  name: string;
}

interface SystemInfo {
  id: string;
  title: string;
  version: string;
  worldTitle?: string;
  worldDescription?: string;
  nextSession?: string | null;
  users?: { active: number; total: number };
  background?: string;
  worldBackground?: string;
  isLoggedIn?: boolean;
  theme?: any;
  config?: any;
}

interface ClientPageProps {
  initialUrl: string;
}

export default function ClientPage({ initialUrl }: ClientPageProps) {
  const [step, setStep] = useState<'init' | 'reconnecting' | 'login' | 'dashboard' | 'setup' | 'startup'>('init');
  const { notifications, addNotification, removeNotification } = useNotifications();

  // Connect State
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);

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

  // Chat State


  const handleLogin = async () => {
    setLoading(true);
    setLoginMessage('Logging in...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 45000); // 45 seconds to match backend 30s + buffer

    try {
      const res = await fetch('/api/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: selectedUser, password }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await res.json();

      if (data.success) {
        setStep('dashboard');
      } else {
        setLoginMessage('');
        setPassword(''); // Clear password on failure
        addNotification('Login failed: ' + data.error, 'error');
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      setLoginMessage('');
      setPassword('');

      if (e.name === 'AbortError') {
        addNotification('Login timed out. Please try again.', 'error');
      } else {
        addNotification('Error: ' + e.message, 'error');
      }
    } finally {
      setLoading(false);
      setLoginMessage('');
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
  // Clear background in setup/startup mode to prevent stale images from previous worlds
  const bgSrc = (step === 'setup' || step === 'startup') ? null : (system?.worldBackground || system?.background);
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
    // Load Recent Actors (Initial)
    // Removed initial load to prevent flash of wrong-system actors.
    // try {
    //   const stored = localStorage.getItem('recent_actors');
    //   if (stored) setRecentActors(JSON.parse(stored));
    // } catch (e) {console.error(e); }

    const checkConfig = async () => {
      try {
        setLoading(true);
        setLoginMessage('Verifying Session...');
        const res = await fetch('/api/session/connect');
        const data = await res.json();
        if (data.connected) {
          setUrl(data.url);
          setUsers(data.users || []);

          // If connected but no users (even after persistent cache fallback), we are truly hosed.
          // Reloading will trigger page.tsx -> SetupScraper.loadCache() which now validates users.
          // If still empty, it will redirect to /setup.
          // EXCEPTION: If we are in 'setup' mode, users are EXPECTED to be empty. Do not reload.
          if ((!data.users || data.users.length === 0) && data.system?.id !== 'setup') {
            console.warn('[ClientPage] Connected but no users found (Live + Cache). Transitioning to setup.');
            setStep('setup');
            return;
          }
          if (data.appVersion) setAppVersion(data.appVersion);

          if (data.system) {
            setSystem(data.system);

            const status = data.system.status;

            // State Machine Transition
            switch (status) {
              case 'setup':
                setStep('setup');
                break;
              case 'startup':
                setStep('startup');
                break;
              case 'loggedIn':
                // Fetch actors if logged in
                const actorRes = await fetch('/api/actors');
                const actorData = await actorRes.json();
                if (actorData.ownedActors || actorData.actors) {
                  setActors(actorData.actors || []);
                  setOwnedActors(actorData.ownedActors || actorData.actors || []);
                  setReadOnlyActors(actorData.readOnlyActors || []);
                  setStep('dashboard');
                } else {
                  // Fallback if actors fail?
                  setStep('dashboard');
                }
                break;
              case 'authenticating':
                // If server is authenticating, wait/show loading? 
                // For now, treat as login screen until confirmed
                setStep('login');
                break;
              case 'connected':
                setStep('login');
                break;
              case 'disconnected':
              default:
                setStep('setup');
                break;
            }
          } else {
            // Connected but no system data - treat as setup mode
            setStep('setup');
          }
        } else {
          // Not connected to Foundry at all - show setup page
          setStep('setup');
        }
      } catch {
        console.warn('Check failed - treating as setup mode');
        setStep('setup');
      } finally {
        setLoading(false);
        setLoginMessage('');
      }
    };
    checkConfig();

  }, []);


  const fetchActors = useCallback(async () => {
    if (loading) return;
    try {
      const res = await fetch('/api/actors');
      if (res.status === 401) {
        if (step === 'dashboard') {
          console.warn('[Actors Poll] 401 Unauthorized. Checking if authenticating...');
          // Check system status before kicking, maybe we are just re-logging?
          const sysRes = await fetch('/api/session/connect');
          const sysData = await sysRes.json();
          if (!sysData.system?.isAuthenticating) {
            console.error('[Actors Poll] Definitive session loss. Redirecting to login.');
            setStep('login');
          } else {
            console.log('[Actors Poll] 401 encountered, but system is authenticating. Ignoring.');
          }
        }
        return;
      }
      const data = await res.json();
      if (data.ownedActors || data.actors) {
        setActors(data.actors || []); // Fallback for old code
        setOwnedActors(data.ownedActors || data.actors || []);
        setReadOnlyActors(data.readOnlyActors || []);
      }
    } catch (error) {
      console.error(error);
    }
  }, [loading, step]);


  // Polling for System State Changes (e.g. World Shutdown / Startup)
  // MOVED TO GLOBAL ShutdownWatcher.tsx
  useEffect(() => {
    const interval = setInterval(async () => {
      if (loading) return;
      try {
        const res = await fetch('/api/session/connect', { cache: 'no-store' });

        if (res.status === 401) {
          if (step === 'dashboard') {
            console.warn('[Session Poll] Unauthorized (401). Redirecting to login.');
            addNotification('Your session has ended.', 'info');
            setStep('login');
          }
          return;
        }

        const data = await res.json();

        if (data.system) {
          const status = data.system.status;

          // 1. Handle Startup/Setup Transitions
          if (status === 'startup' && step !== 'startup') {
            setStep('startup');
            return;
          }

          // Transition from startup to ready state - NO RELOAD
          if (step === 'startup') {
            if (status === 'connected' || status === 'loggedIn') {
              console.log(`[ClientPage] World ready! Transitioning from startup to ${status}`);
              setSystem(data.system);
              setUsers(data.users || []);
              if (status === 'loggedIn') {
                fetchActors();
                setStep('dashboard');
              } else {
                setStep('login');
              }
              return;
            } else if (status === 'setup') {
              // World failed to start, return to setup without reload
              console.warn('[ClientPage] World failed to start. Returning to setup.');
              setStep('setup');
              return;
            }
          }

          // 2. Setup -> Connected (world launched from setup page) - NO RELOAD
          if (status !== 'setup' && step === 'setup') {
            console.log(`[ClientPage] World launched! Transitioning from setup to ${status}`);
            setSystem(data.system);
            setUsers(data.users || []);
            if (status === 'loggedIn') {
              fetchActors();
              setStep('dashboard');
            } else {
              setStep('login');
            }
            return;
          }


          if ((step === 'login' || step === 'dashboard') && status === 'setup') {
            console.warn(`[Session Poll] World shutdown detected from ${step}.`);
            if (step === 'dashboard') addNotification('World has shut down.', 'error');

            // Force logout to clear session state on server so we don't auto-login on restart
            fetch('/api/session/logout', { method: 'POST' }).catch(err => console.error('Logout invalidation failed', err));

            setStep('setup');
            return;
          }

          // 4. Kicked / Session Loss from Dashboard
          if (step === 'dashboard') {
            if (status === 'connected' && !data.system.isLoggedIn) {
              // Connected but not logged in -> Login
              console.warn('[Session Poll] Session ended (reported by system). Redirecting to login.', data);
              addNotification('Your session has ended.', 'info');
              setStep('login');
            } else if (status === 'disconnected') {
              // Disconnected entirely -> Setup (No World)
              console.warn('[Session Poll] Disconnected from world. Redirecting to setup.');
              setStep('setup');
            }
          }
        } else if (!data.connected && step !== 'setup') {
          // Connection lost entirely - show setup page
          setStep('setup');
        }
      } catch {
        // Silent error for poll failures
      }
    }, 500); // Poll every 500ms for faster updates
    return () => clearInterval(interval);
  }, [step, loading, addNotification, fetchActors, url]);

  const handleRetryConnection = () => {
    window.location.reload();
  };





  useEffect(() => {
    if (step !== 'dashboard') return;

    // Initial fetch
    fetchActors();

    const interval = setInterval(() => {
      fetchActors();
    }, 5000); // Poll actors every 5 seconds

    return () => clearInterval(interval);
  }, [step, fetchActors]);

  // Helper to render an actor card
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

            {/* Dynamic Subtext based on Module Config */}
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

            {/* Stats Grid */}
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

      {/* Content grows to fill space, pushing footer down */}
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
                  {users.length > 0 ? (
                    <div>
                      <label className="block text-sm font-medium mb-1 opacity-70">Player</label>
                      <select
                        value={selectedUser}
                        onChange={(e) => setSelectedUser(e.target.value)}
                        className={`w-full p-2 rounded border outline-none ${theme.input} appearance-none`}
                      >
                        <option value="" disabled>-- Select Player --</option>
                        {users.map(u => (
                          <option
                            key={u.id || u._id}
                            value={u.name}
                            disabled={(u as any).active}
                            className={`bg-neutral-900 text-white ${(u as any).active ? 'text-white/50 bg-neutral-800' : ''}`}
                          >
                            {u.name} {(u as any).active ? ' (Logged In)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium mb-1 opacity-70">Username</label>
                      <input
                        type="text"
                        value={selectedUser}
                        onChange={(e) => setSelectedUser(e.target.value)}
                        className={`w-full p-2 rounded border outline-none ${theme.input}`}
                        placeholder="Enter username manually"
                      />
                      <p className="text-xs text-yellow-500 mt-1">Could not detect users automatically.</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium mb-1 opacity-70">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`w-full p-2 rounded border outline-none ${theme.input}`}
                    />
                  </div>
                  <button
                    onClick={handleLogin}
                    disabled={loading || !selectedUser}
                    className={`w-full ${theme.success} text-white font-bold py-2 px-4 rounded transition-all disabled:opacity-50`}
                  >
                    {loading ? 'Logging in...' : 'Login'}
                  </button>
                </div>
              </div>
            </div>
          )
        }

        {
          step === 'setup' && (
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
                    <span>Read Docs</span>
                    <img src="https://img.shields.io/badge/github-repo-blue?logo=github" alt="GitHub Repo" className="opacity-80" />
                  </a>
                </div>
              </div>
            </div>
          )
        }

        {
          step === 'dashboard' && (
            <div className="max-w-7xl mx-auto space-y-8 p-6 bg-black/60 rounded-xl backdrop-blur-sm border border-white/10">
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
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="text-xl font-bold uppercase tracking-widest opacity-40 text-neutral-400">Other Characters (Read Only)</h3>
                    <div className="h-px flex-1 bg-white/10"></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {readOnlyActors.map((actor, idx) => renderActorCard(actor, ownedActors.length + idx, false))}
                  </div>
                </div>
              )}
            </div>
          )
        }

      </div>

      {/* Footer Info Box (Relative Flow) */}
      <div className="w-full max-w-7xl mx-auto mt-12 bg-black/80 backdrop-blur-md p-6 rounded-xl border border-white/10 text-center md:text-right shadow-2xl">
        <div className="text-4xl font-black tracking-tighter text-white mb-1" style={{ fontFamily: 'var(--font-cinzel), serif' }}>
          SheetDelver
        </div>
        {system && step !== 'setup' && step !== 'startup' && step !== 'init' && (
          <div className={`text-sm font-bold tracking-widest opacity-80 mb-2 ${theme.accent}`}>
            {system.title.toUpperCase()}
          </div>
        )}
        <div className="text-[10px] opacity-30 font-mono tracking-wide">
          v{appVersion}
        </div>
      </div>

      {/* Persistent Player List when logged in */}
      {(step === 'dashboard') && <PlayerList />}

      <NotificationContainer notifications={notifications} removeNotification={removeNotification} />

      {/* Loading Overlay */}
      <LoadingModal message={loginMessage} visible={loading && !!loginMessage} />
    </main >
  );
}
