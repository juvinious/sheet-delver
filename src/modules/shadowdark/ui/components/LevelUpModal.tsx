'use client';

import React from 'react';
import { useLevelUp, LevelUpProps } from './levelup/useLevelUp';
import { LevelUpHeader } from './levelup/sections/LevelUpHeader';
import { HPRollSection } from './levelup/sections/HPRollSection';
import { GoldRollSection } from './levelup/sections/GoldRollSection';
import { TalentBoonSection } from './levelup/sections/TalentBoonSection';
import { SpellSelectionSection } from './levelup/sections/SpellSelectionSection';
import { LanguageSelectionSection } from './levelup/sections/LanguageSelectionSection';
import { SelectionOverlay } from './levelup/sections/SelectionOverlay';
import { LevelUpFooter } from './levelup/sections/LevelUpFooter';
import {
    resolveImage,
    formatDescription,
    getSafeDescription
} from '../sheet-utils';

export const LevelUpModal = (props: LevelUpProps) => {
    const { state, actions } = useLevelUp(props);
    const foundryUrl = props.foundryUrl;
    //const activeClassImage = state.activeClassObj?.img?.startsWith('systems') ? `/${state.activeClassObj.img}` : state.activeClassObj.img;
    //dangerouslySetInnerHTML={{ __html: state.activeClassObj.system?.description?.split('.')[0] + '.' || "Class Archetype" }}
    // Common Shadowdark Class Card Style

    const ClassCard = state.activeClassObj ? (
        <div className="bg-white border-2 border-black p-4 flex items-center gap-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-6">
            <div className="w-12 h-12 bg-black flex-shrink-0 flex items-center justify-center border border-black overflow-hidden">
                <img
                    src={resolveImage(state.activeClassObj?.img?.startsWith('systems') ? `/${state.activeClassObj.img}` : state.activeClassObj.img, foundryUrl)}
                    className="w-full h-full object-cover"
                    alt={state.activeClassObj.name}
                />
            </div>
            <div className="flex-1">
                <h4 className="font-serif font-black text-xl uppercase tracking-wider text-black leading-none">{state.activeClassObj.name}</h4>
                <div
                    className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mt-1 italic"
                    dangerouslySetInnerHTML={{ __html: state.activeClassObj.system?.description || "Class Archetype" }}
                />
            </div>
        </div>
    ) : null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10 animate-in fade-in duration-300">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" onClick={props.onCancel}></div>

            {/* Modal Body */}
            <div className="relative w-full max-w-2xl max-h-[90vh] bg-neutral-50 border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">

                {state.pendingChoices && (
                    <SelectionOverlay
                        pendingChoices={state.pendingChoices}
                        onSelect={actions.handleChoiceSelection}
                    />
                )}

                <LevelUpHeader
                    actorId={props.actorId}
                    currentLevel={props.currentLevel}
                    targetLevel={props.targetLevel}
                    targetClassUuid={state.targetClassUuid}
                    availableClasses={props.availableClasses || []}
                    loading={state.loading}
                    error={state.error}
                    needsBoon={state.needsBoon}
                    availablePatrons={state.availablePatrons}
                    selectedPatronUuid={state.selectedPatronUuid}
                    loadingPatrons={state.loadingPatrons}
                    onClassChange={actions.setTargetClassUuid}
                    onPatronChange={actions.setSelectedPatronUuid}
                    foundryUrl={props.foundryUrl}
                />

                {/* Main Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">

                    {ClassCard}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <HPRollSection
                            hpRoll={state.hpRoll}
                            confirmReroll={state.confirmReroll}
                            loading={state.loading}
                            onRoll={actions.handleRollHP}
                            onClear={() => actions.setHpRoll(0)}
                            setConfirmReroll={actions.setConfirmReroll}
                        />

                        {props.currentLevel === 0 && (
                            <GoldRollSection
                                goldRoll={state.goldRoll}
                                loading={state.loading}
                                onRoll={actions.handleRollGold}
                                onClear={() => actions.setGoldRoll(0)}
                            />
                        )}
                    </div>

                    <TalentBoonSection
                        requiredTalents={state.requiredTalents}
                        rolledTalents={state.rolledTalents}
                        needsBoon={state.needsBoon}
                        startingBoons={state.startingBoons}
                        rolledBoons={state.rolledBoons}
                        loading={state.loading}
                        onRollTalent={actions.handleRollTalent}
                        onRollBoon={actions.handleRollBoon}
                        onClearTalents={() => actions.setRolledTalents([])}
                    />

                    <SpellSelectionSection
                        isSpellcaster={state.isSpellcaster}
                        spellsToChooseTotal={state.spellsToChooseTotal}
                        spellsToChoose={state.spellsToChoose}
                        availableSpells={state.availableSpells}
                        selectedSpells={state.selectedSpells}
                        onSelectedSpellsChange={actions.setSelectedSpells}
                    />

                    <LanguageSelectionSection
                        languageGroups={state.languageGroups}
                        selectedLanguages={state.selectedLanguages}
                        fixedLanguages={state.fixedLanguages}
                        knownLanguages={state.knownLanguages}
                        availableLanguages={props.availableLanguages || []}
                        onSelectedLanguagesChange={actions.setSelectedLanguages}
                    />
                </div>

                <LevelUpFooter
                    onCancel={props.onCancel}
                    onConfirm={actions.handleConfirm}
                    isComplete={actions.isComplete()}
                    loading={state.loading}
                />
            </div>
        </div>
    );
};
