'use client';

import { useState, useEffect } from 'react';
import { SharedContentModal } from './SharedContentModal';
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useFoundry } from '@/app/ui/context/FoundryContext';
import { useUI } from '@/app/ui/context/UIContext';
import { useConfig } from '@/app/ui/context/ConfigContext';
import { useNotifications } from './NotificationSystem';
import { ConfirmationModal } from './ConfirmationModal';
import { getMatchingAdapter } from '@/modules/core/registry';
import SystemTools from './SystemTools';
import LoadingModal from './LoadingModal';
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

export default function ClientPage() {
  const {
    step, setStep, token, users, system, currentUser,
    handleLogin: globalLogin, handleLogout, fetchActors,
    ownedActors, readOnlyActors
  } = useFoundry();
  const { addNotification } = useNotifications();
  const { foundryUrl: configUrl } = useConfig();

  const [loading, setLoading] = useState(false);
  const [loginMessage, setLoginMessage] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [password, setPassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean, actorId: string, actorName: string }>({
    isOpen: false,
    actorId: '',
    actorName: ''
  });

  const currentUserId = currentUser?._id || currentUser?.id || null;

  const handleLogin = async () => {
    setLoading(true);
    setLoginMessage('Logging in...');
    try {
      await globalLogin(selectedUser, password);
    } catch (e) {
      setPassword('');
    } finally {
      setLoading(false);
      setLoginMessage('');
    }
  };

  const handleDeleteActor = async () => {
    if (!confirmDelete.actorId) return;
    setLoading(true);
    setLoginMessage(`Deleting ${confirmDelete.actorName}...`);

    try {
      const res = await fetch(`/api/actors/${confirmDelete.actorId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        addNotification(`Deleted ${confirmDelete.actorName}`, 'success');
        await fetchActors();
      } else {
        const data = await res.json();
        addNotification(`Failed to delete: ${data.error || 'Unknown error'}`, 'error');
      }
    } catch (e: any) {
      addNotification(`Error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
      setLoginMessage('');
      setConfirmDelete({ isOpen: false, actorId: '', actorName: '' });
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
      backgroundImage: `url(${bgSrc})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    }
    : {};

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
              src={actor.img || '/icons/svg/mystery-man.svg'}
              alt={actor.name}
              className="w-16 h-16 rounded-lg bg-black/40 object-cover border border-white/10 group-hover:border-amber-500/30 transition-colors"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/icons/svg/mystery-man.svg';
              }}
            />
            {clickable && (
              <div className="absolute inset-0 bg-amber-500/0 group-hover:bg-amber-500/5 transition-colors rounded-lg"></div>
            )}
          </div>
          <div className="flex-1 min-w-0 relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete({
                  isOpen: true,
                  actorId: actor.id,
                  actorName: actor.name
                });
              }}
              className="absolute -top-1 -right-1 p-2 rounded-lg bg-black/20 hover:bg-red-500/20 text-white/20 hover:text-red-500 backdrop-blur-md border border-white/5 hover:border-red-500/50 transition-all duration-300 group/delete z-10"
              title="Delete Character"
            >
              <Trash2 className="w-4 h-4 transition-transform group-hover/delete:scale-110" />
            </button>
            <h3 className={`font-bold text-lg truncate pr-8 ${theme.accent} ${clickable ? 'group-hover:brightness-125' : ''}`}>
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
        </div >
      </div >
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

        {step === 'initializing' && (
          <div className="flex flex-col items-center justify-center min-h-[80vh] animate-in fade-in duration-700">
            <h1 className={`text-6xl font-black tracking-tighter text-white mb-8`} style={{ fontFamily: 'var(--font-cinzel), serif' }}>
              SheetDelver
            </h1>
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-white/50 text-sm font-mono tracking-widest uppercase">Booting System...</p>
              <p className="text-white/30 text-xs font-mono">Warming up Compendium Cache</p>
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
            <p className="text-xs font-mono opacity-40 mb-8">v{system?.appVersion || '...'}</p>

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
              <SharedContentModal />

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
                      <span className="font-bold text-white">
                        Connected as {users.find(u => (u._id || u.id) === currentUserId)?.name || 'Connecting...'}
                      </span>
                      <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                      <span>{configUrl}</span>
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
                  <h3 className={`text-xl font-bold uppercase tracking-widest opacity-80 ${theme.accent}`}>Characters</h3>
                  <div className="h-px flex-1 bg-white/10"></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {ownedActors.length === 0 && <p className="opacity-50 italic text-sm py-4">You don&apos;t own any characters in this world.</p>}
                  {ownedActors.map((actor, idx) => renderActorCard(actor, idx, true))}
                </div>
              </div>

              {/* Read Only Actors 
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
                */}
            </div>
          )
        }

      </div>

      {/* Footer Info Box (Relative Flow) */}
      <div className="w-full max-w-7xl mx-auto mt-12 bg-black/80 backdrop-blur-md p-6 rounded-xl border border-white/10 text-center md:text-right shadow-2xl">
        <div className="text-4xl font-black tracking-tighter text-white mb-2 underline decoration-amber-500 underline-offset-8 decoration-4" style={{ fontFamily: 'var(--font-cinzel), serif' }}>
          SheetDelver
        </div>
        {system && step !== 'setup' && step !== 'startup' && step !== 'init' && step !== 'initializing' && (
          <div className={`text-sm font-bold tracking-widest opacity-80 mb-2 ${theme.accent}`}>
            {system.title.toUpperCase()} ({system.version.toString().toUpperCase()})
          </div>
        )}
        <div className="text-[10px] opacity-30 font-mono tracking-wide mb-4">
          v{system?.appVersion || '...'}
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

      <ConfirmationModal
        isOpen={confirmDelete.isOpen}
        title="Delete Character"
        message={`Are you sure you want to delete ${confirmDelete.actorName}? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Keep"
        isDanger={true}
        onConfirm={handleDeleteActor}
        onCancel={() => setConfirmDelete({ ...confirmDelete, isOpen: false })}
        theme={system?.componentStyles?.modal}
      />

      <LoadingModal
        message={loginMessage}
        visible={loading && !!loginMessage}
        theme={system?.componentStyles?.loadingModal}
      />
    </main >
  );
}
