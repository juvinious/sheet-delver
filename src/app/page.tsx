'use client';

import { useState, useEffect } from 'react';

interface User {
  id: string;
  name: string;
}

interface SystemInfo {
  id: string;
  title: string;
  version: string;
  background?: string;
}

export default function Home() {
  const [step, setStep] = useState<'connect' | 'login' | 'dashboard'>('connect');

  // Connect State
  const [url, setUrl] = useState('http://localhost:30000');
  const [loading, setLoading] = useState(false);

  // Login State
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [password, setPassword] = useState('');
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [appVersion, setAppVersion] = useState('');

  // Dashboard State
  const [actors, setActors] = useState<any[]>([]);
  const [recentActors, setRecentActors] = useState<any[]>([]);

  // Theme Logic
  const getTheme = () => {
    if (system?.id === 'shadowdark') {
      return {
        bg: 'bg-neutral-900',
        panelBg: 'bg-neutral-800',
        text: 'text-neutral-200',
        accent: 'text-amber-500',
        button: 'bg-amber-700 hover:bg-amber-600',
        headerFont: 'font-serif tracking-widest',
        input: 'bg-neutral-950 border-neutral-700 focus:border-amber-600',
        success: 'bg-green-800 hover:bg-green-700' // Darker green for gritty feel
      };
    }
    // Default / D&D 5eish modern dark
    return {
      bg: 'bg-slate-900',
      panelBg: 'bg-slate-800',
      text: 'text-slate-100',
      accent: 'text-amber-500',
      button: 'bg-amber-600 hover:bg-amber-700',
      headerFont: 'font-sans font-bold',
      input: 'bg-slate-700 border-slate-600 focus:border-amber-500',
      success: 'bg-green-600 hover:bg-green-700'
    };
  };

  const theme = getTheme();

  // Resolve background image
  const bgStyle = system?.background
    ? { backgroundImage: `url(${system.background.startsWith('http') ? system.background : `${url}/${system.background}`})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {};

  // Auto-Connect Effect
  useEffect(() => {
    // Load Recent Actors
    try {
      const stored = localStorage.getItem('recent_actors');
      if (stored) setRecentActors(JSON.parse(stored));
    } catch (e) { console.error(e); }

    const checkConfig = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/session/connect');
        const data = await res.json();
        if (data.connected) {
          setUrl(data.url);
          setUsers(data.users || []);
          if (data.system) setSystem(data.system);
          if (data.appVersion) setAppVersion(data.appVersion);
          if (data.users.length > 0) setSelectedUser(data.users[0].name);

          if (data.users.length > 0) setSelectedUser(data.users[0].name);

          // Try Auto-Resume
          if (data.system?.isLoggedIn) {
            const actorRes = await fetch('/api/actors');
            const actorData = await actorRes.json();
            if (actorData.actors) {
              setActors(actorData.actors);
              setStep('dashboard'); // Skip Login!
            } else {
              setStep('login');
            }
          } else {
            setStep('login');
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    checkConfig();
  }, []);


  const handleConnect = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/session/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
        if (data.system) setSystem(data.system);
        if (data.users.length > 0) {
          setSelectedUser(data.users[0].name);
        }
        setStep('login');
      } else {
        alert('Connection failed: ' + data.error);
      }
    } catch (e) {
      alert('Error: ' + e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: selectedUser, password }),
      });
      const data = await res.json();
      if (data.success) {
        setStep('dashboard');
        fetchActors();
      } else {
        alert('Login failed: ' + data.error);
      }
    } catch (e) {
      alert('Error: ' + e);
    } finally {
      setLoading(false);
    }
  };

  const fetchActors = async () => {
    const res = await fetch('/api/actors');
    const data = await res.json();
    if (data.actors) {
      setActors(data.actors);
    }
  };

  return (
    <main
      className={`min-h-screen ${theme.bg} ${theme.text} p-8 font-sans transition-colors duration-500`}
      style={bgStyle}
    >

      {/* Footer Info Box */}
      <div className="fixed bottom-4 right-4 bg-black/70 backdrop-blur-md p-4 rounded-lg border border-white/10 text-right shadow-xl">
        {system && (
          <div className={`text-2xl font-bold mb-1 ${theme.headerFont} ${theme.accent}`}>
            {system.title.toUpperCase()}
          </div>
        )}
        <div className="text-xs opacity-40 font-mono">
          v{appVersion}
        </div>
      </div>

      {step === 'connect' && (
        <div className={`max-w-md mx-auto ${theme.panelBg} p-6 rounded-lg shadow-lg border border-transparent`}>
          <h2 className={`text-xl mb-4 ${theme.headerFont}`}>Connect to Instance</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 opacity-70">Foundry URL</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={`w-full p-2 rounded border outline-none ${theme.input}`}
              />
            </div>
            <button
              onClick={handleConnect}
              disabled={loading}
              className={`w-full ${theme.button} text-white font-bold py-2 px-4 rounded transition-all disabled:opacity-50`}
            >
              {loading ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </div>
      )}

      {step === 'login' && (
        <div className={`max-w-md mx-auto ${theme.panelBg} p-6 rounded-lg shadow-lg`}>
          <h2 className={`text-xl mb-4 ${theme.headerFont}`}>Login</h2>
          <div className="space-y-4">
            {users.length > 0 ? (
              <div>
                <label className="block text-sm font-medium mb-1 opacity-70">Select User</label>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className={`w-full p-2 rounded border outline-none ${theme.input} appearance-none`}
                >
                  {users.map(u => (
                    <option key={u.id} value={u.name}>{u.name}</option>
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
              disabled={loading}
              className={`w-full ${theme.success} text-white font-bold py-2 px-4 rounded transition-all disabled:opacity-50`}
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </div>
        </div>
      )}

      {step === 'dashboard' && (
        <div className="max-w-7xl mx-auto space-y-8 p-6 bg-black/60 rounded-xl backdrop-blur-sm border border-white/10">
          {/* Header / Status */}
          <div className="flex justify-between items-center bg-black/40 p-4 rounded-lg border border-white/5">
            <div>
              <h2 className={`text-2xl ${theme.headerFont} ${theme.accent}`}>Dashboard</h2>
              <p className="text-xs opacity-50">Connected to {url}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className="text-sm font-bold opacity-80">Online</span>
              <button
                onClick={() => { setStep('login'); setActors([]); }}
                className="ml-4 text-xs opacity-50 hover:opacity-100 hover:text-red-400 underline"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Recent Actors */}
          {recentActors.length > 0 && (
            <div>
              <h3 className={`text-lg mb-4 opacity-70 ${theme.headerFont}`}>Recent Actors</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {recentActors.map((actor: any) => (
                  <div
                    key={`recent-${actor.id}`}
                    onClick={() => window.location.href = `/actors/${actor.id}`}
                    className={`
                                    ${theme.panelBg} p-3 rounded-lg shadow border border-transparent 
                                    hover:border-amber-500/50 transition-all cursor-pointer group relative overflow-hidden
                                `}
                  >
                    <div className="aspect-square bg-black/40 rounded mb-2 overflow-hidden">
                      <img
                        src={actor.img !== 'icons/svg/mystery-man.svg' ? (url + '/' + actor.img) : '/placeholder.png'}
                        alt={actor.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    </div>
                    <div className={`font-bold text-sm truncate ${theme.accent}`}>{actor.name}</div>
                    <div className="text-[10px] opacity-50 truncate">{actor.system}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Actors */}
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {actors.length === 0 && <p className="opacity-50 italic">No actors found (or waiting to fetch...)</p>}
              {actors.map((actor) => (
                <div
                  key={actor.id}
                  onClick={() => window.location.href = `/actors/${actor.id}`}
                  className={`
                        ${theme.panelBg} p-4 rounded-lg shadow border border-transparent 
                        hover:border-amber-500/50 transition-all cursor-pointer block group
                      `}
                >
                  <div className="flex items-start gap-4">
                    <img
                      src={actor.img !== 'icons/svg/mystery-man.svg' ? (url + '/' + actor.img) : '/placeholder.png'}
                      alt={actor.name}
                      className="w-16 h-16 rounded bg-black/20 object-cover"
                    />
                    <div className="flex-1">
                      <h3 className={`font-bold text-lg ${theme.accent} group-hover:brightness-110`}>{actor.name}</h3>
                      <p className="opacity-60 text-sm mb-2 capitalize">{actor.type}</p>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {actor.hp && (
                          <div className="bg-black/20 px-2 py-1 rounded">
                            <span className="opacity-50 text-xs uppercase block">HP</span>
                            <span className="font-mono font-bold text-green-400">{actor.hp.value}</span>
                            <span className="opacity-50"> / {actor.hp.max}</span>
                          </div>
                        )}
                        {(actor.ac !== undefined) && (
                          <div className="bg-black/20 px-2 py-1 rounded">
                            <span className="opacity-50 text-xs uppercase block">AC</span>
                            <span className="font-mono font-bold text-blue-400">{actor.ac}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
