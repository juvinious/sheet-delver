
import React from 'react';

interface Props {
    actorId: string;
    currentLevel: number;
    targetLevel: number;
    targetClassUuid: string;
    availableClasses: any[];
    loading: boolean;
    error: string | null;
    needsBoon: boolean;
    availablePatrons: any[];
    selectedPatronUuid: string;
    loadingPatrons: boolean;
    onClassChange: (uuid: string) => void;
    onPatronChange: (uuid: string) => void;
    foundryUrl?: string;
    actorName?: string;
}

export const LevelUpHeader = ({
    actorId,
    actorName,
    currentLevel,
    targetLevel,
    targetClassUuid,
    availableClasses,
    loading,
    error,
    needsBoon,
    availablePatrons,
    selectedPatronUuid,
    loadingPatrons,
    onClassChange,
    onPatronChange,
    classLocked
}: Props & { classLocked?: boolean }) => {
    return (
        <div className="bg-white border-b-4 border-black">
            <div className="bg-black p-6 flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-wider font-serif">
                        {actorName ? `${actorName} ` : ''}Level Up
                    </h2>
                    <p className="text-neutral-400 text-xs font-bold uppercase tracking-widest mt-1">
                        Level {currentLevel} <span className="text-neutral-600 px-1">-&gt;</span> {targetLevel}
                    </p>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border-y-2 border-red-600 p-4 text-red-900 text-sm font-bold flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>{error}</span>
                </div>
            )}

            {currentLevel === 0 && (
                <div className="p-6 bg-neutral-100 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-xs font-black text-black uppercase tracking-widest ml-1">Select Character Class</label>
                        <select
                            value={targetClassUuid}
                            onChange={(e) => onClassChange(e.target.value)}
                            disabled={classLocked}
                            className={`w-full bg-white border-2 border-black text-black p-3 font-bold font-serif outline-none focus:bg-neutral-50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase tracking-wide ${classLocked ? 'opacity-50 cursor-not-allowed bg-neutral-100' : 'cursor-pointer'}`}
                        >
                            <option value="">-- Choose Class --</option>
                            {[...availableClasses].sort((a, b) => a.name.localeCompare(b.name)).map((c: any) => (
                                <option key={c.uuid || c._id} value={c.uuid || c._id}>{c.name}</option>
                            ))}
                        </select>
                        {classLocked && <p className="text-[10px] text-neutral-500 italic ml-1">* Class selected during creation</p>}
                    </div>

                    {needsBoon && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-right-4 duration-500">
                            <label className="text-xs font-black text-black uppercase tracking-widest ml-1">Choose Divine Patron</label>
                            <select
                                value={selectedPatronUuid}
                                onChange={(e) => onPatronChange(e.target.value)}
                                className="w-full bg-white border-2 border-black text-black p-3 font-bold font-serif outline-none focus:bg-neutral-50 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                            >
                                <option value="">-- Choose Patron --</option>
                                {availablePatrons.map((p: any) => (
                                    <option key={p.uuid || p._id} value={p.uuid || p._id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
