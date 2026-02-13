import { SectionStatus } from '../useLevelUp';

interface Props {
    requiredTalents: number;
    rolledTalents: any[];
    needsBoon: boolean;
    startingBoons: number;
    rolledBoons: any[];
    choiceRolls: number;
    talentStatus: SectionStatus;
    boonStatus: SectionStatus;
    onRollTalent: () => void;
    onRollBoon: () => void;
    onRemoveTalent: (index: number) => void;
    onRemoveBoon: (index: number) => void;
    onResetTalents?: () => void;
    onResetBoons?: () => void;
    onResolveNested?: (index: number, item: any, context: 'talent' | 'boon') => void;
    patronName?: string;
}

export const TalentBoonSection = ({
    requiredTalents,
    rolledTalents,
    needsBoon,
    startingBoons,
    rolledBoons,
    choiceRolls,
    talentStatus,
    boonStatus,
    onRollTalent,
    onRollBoon,
    onRemoveTalent,
    onRemoveBoon,
    onResetTalents,
    onResetBoons,
    onResolveNested,
    patronName
}: Props) => {

    // Calculate availability
    const usedChoices = Math.max(0, rolledTalents.length - requiredTalents) + Math.max(0, rolledBoons.length - startingBoons);
    const choicesAvailable = Math.max(0, choiceRolls - usedChoices);

    const canRollTalent = talentStatus !== 'LOADING' && (rolledTalents.length < requiredTalents || choicesAvailable > 0);
    const canRollBoon = boonStatus !== 'LOADING' && (rolledBoons.length < startingBoons || choicesAvailable > 0);

    return (
        <div className="space-y-6">
            {/* Show Talent Section if required OR if we have choices allowed (even if 0 required) */}
            {(requiredTalents > 0 || choiceRolls > 0) && (
                <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden p-4">
                    <div className="bg-black text-white px-4 py-2 font-serif font-bold text-lg uppercase tracking-wider -mx-4 -mt-4 mb-4 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-white rotate-45"></span>
                            <span>Class Talents</span>
                        </div>
                        <div className="flex gap-2 items-center">
                            {onResetTalents && (
                                <button
                                    onClick={onResetTalents}
                                    className="text-[10px] font-bold bg-neutral-700 hover:bg-red-600 text-white px-2 py-0.5 rounded-sm transition-colors uppercase tracking-wider"
                                    title="Reset all talents"
                                >
                                    Reset
                                </button>
                            )}
                            {requiredTalents > 0 && (
                                <div className="text-xs font-black bg-white text-black px-2 py-0.5 rounded-sm">
                                    Req: {Math.min(rolledTalents.length, requiredTalents)} / {requiredTalents}
                                </div>
                            )}
                            {choiceRolls > 0 && (
                                <div className="text-xs font-black bg-neutral-700 text-white px-2 py-0.5 rounded-sm">
                                    Choice: {usedChoices} / {choiceRolls}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 mb-4">
                        {rolledTalents.map((t, i) => {
                            const isNestedTable = t.type === 'RollTable' || t.documentCollection === 'RollTable' || t.name === "Distribute to Stats" || (t.text || "").toLowerCase().includes("distribute +2");

                            return (
                                <div key={i} className="bg-neutral-50 border-2 border-black p-3 animate-in slide-in-from-left-2 duration-200 group flex flex-col gap-2">
                                    <div className="flex items-center gap-3 w-full">
                                        <div className="bg-black text-white w-6 h-6 flex items-center justify-center font-bold text-xs ring-2 ring-black flex-shrink-0">
                                            {i + 1}
                                        </div>
                                        <span className="font-serif font-black uppercase text-sm tracking-wide flex-1">{t.name}</span>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => onRemoveTalent(i)}
                                                className="text-neutral-400 hover:text-red-600 transition-colors p-1"
                                                title="Remove Talent"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>

                                    {isNestedTable && onResolveNested && (
                                        <button
                                            onClick={() => onResolveNested(i, t, 'talent')}
                                            className="ml-9 text-xs font-bold bg-black text-white py-1 px-3 hover:bg-neutral-800 transition-colors self-start uppercase tracking-wider flex items-center gap-2"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                            </svg>
                                            {t.name === "Distribute to Stats" ? "Select Stats" : `Select from ${t.name}`}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                        {rolledTalents.length === 0 && (
                            <div className="text-neutral-400 font-bold uppercase tracking-widest text-[10px] py-4 text-center border-2 border-dashed border-neutral-200">
                                No talents rolled yet
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={onRollTalent}
                            disabled={!canRollTalent}
                            className="flex-1 bg-black text-white font-black py-2 hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400 transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                            </svg>
                            Roll Talent
                        </button>
                    </div>
                </div>
            )}

            {/* Show Boon Section if needed (Warlock) */}
            {needsBoon && (
                <div className="bg-purple-50 border-2 border-purple-900 shadow-[4px_4px_0px_0px_rgba(88,28,135,1)] relative overflow-hidden p-4">
                    <div className="bg-purple-900 text-white px-4 py-2 font-serif font-bold text-lg uppercase tracking-wider -mx-4 -mt-4 mb-4 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <span className="text-purple-300">✧</span>
                            <span>Boons</span>
                        </div>
                        <div className="flex gap-2">
                            {onResetBoons && (
                                <button
                                    onClick={onResetBoons}
                                    className="text-[10px] font-bold bg-neutral-700 hover:bg-red-600 text-white px-2 py-0.5 rounded-sm transition-colors uppercase tracking-wider"
                                    title="Reset all boons"
                                >
                                    Reset
                                </button>
                            )}
                            {startingBoons > 0 && (
                                <div className="text-xs font-black bg-white text-purple-900 px-2 py-0.5 rounded-sm">
                                    Req: {Math.min(rolledBoons.length, startingBoons)} / {startingBoons}
                                </div>
                            )}
                            {/* Only show Choice counter here too if relevant, or just rely on the Talent section one? 
                                 It's a shared pool. Let's show it in both or just one. 
                                 Showing in both reinforces the shared nature. */}
                            {choiceRolls > 0 && (
                                <div className="text-xs font-black bg-purple-800 text-white px-2 py-0.5 rounded-sm">
                                    Choice: {usedChoices} / {choiceRolls}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 mb-4">
                        {rolledBoons.map((b, i) => (
                            <div key={i} className="bg-white border-2 border-purple-900 p-3 flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-200 group">
                                <div className="bg-purple-900 text-white w-6 h-6 flex items-center justify-center font-bold text-xs ring-1 ring-purple-300 flex-shrink-0">
                                    {i + 1}
                                </div>
                                <span className="font-serif font-black uppercase text-sm tracking-wide text-purple-950 flex-1">{b.name}</span>
                                <button
                                    onClick={() => onRemoveBoon(i)}
                                    className="text-purple-300 hover:text-red-600 transition-colors p-1"
                                    title="Remove Boon"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                        {rolledBoons.length === 0 && (
                            <div className="text-purple-300 font-bold uppercase tracking-widest text-[10px] py-4 text-center border-2 border-dashed border-purple-200">
                                No boons granted yet
                            </div>
                        )}
                    </div>

                    <button
                        onClick={onRollBoon}
                        disabled={!canRollBoon}
                        className="w-full bg-purple-900 text-white font-black py-2 hover:bg-purple-800 disabled:bg-neutral-200 disabled:text-neutral-400 transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none shadow-[2px_2px_0px_0px_rgba(88,28,135,1)] uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                    >
                        <svg className="w-4 h-4 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                        Seek Reward from {patronName || "Patron"}
                    </button>
                    {rollingBoonHelpText && (
                        <p className="mt-2 text-[10px] text-purple-700 font-bold text-center uppercase tracking-widest opacity-60">
                            * Granted by your Patron
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

const rollingBoonHelpText = true;
