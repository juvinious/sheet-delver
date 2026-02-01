'use client';

import React from 'react';
import { useLevelUp, LevelUpProps } from './levelup/useLevelUp';
import { LevelUpHeader } from './levelup/sections/LevelUpHeader';
import { HPRollSection } from './levelup/sections/HPRollSection';
import { GoldRollSection } from './levelup/sections/GoldRollSection';
import { TalentBoonSection } from './levelup/sections/TalentBoonSection';
import { SpellSelectionSection } from './levelup/sections/SpellSelectionSection';
import { LanguageSelectionSection } from './levelup/sections/LanguageSelectionSection';
import { StatSelectionSection } from './levelup/sections/StatSelectionSection';
import { WeaponSelectionSection } from './levelup/sections/WeaponSelectionSection';
import { ArmorSelectionSection } from './levelup/sections/ArmorSelectionSection';
import { SelectionOverlay } from './levelup/sections/SelectionOverlay';
import { LoadingOverlay } from './levelup/sections/LoadingOverlay';
import { LevelUpFooter } from './levelup/sections/LevelUpFooter';
import { ExtraSpellSelectionSection } from './levelup/sections/ExtraSpellSelectionSection';

// ... (imports)

// ... (inside component)

import {
    resolveImage
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
            <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"></div>

            {/* Modal Body */}
            <div className="relative w-full max-w-2xl max-h-[90vh] bg-neutral-50 border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">

                {state.pendingChoices && (
                    <SelectionOverlay
                        pendingChoices={state.pendingChoices}
                        onSelect={actions.handleChoiceSelection}
                        foundryUrl={props.foundryUrl}
                    />
                )}

                {(state.loadingClass || state.loadingPatrons || state.isSubmitting) && <LoadingOverlay />}

                <LevelUpHeader
                    actorName={props.actorName}
                    currentLevel={props.currentLevel}
                    targetLevel={props.targetLevel}
                    targetClassUuid={state.targetClassUuid}
                    availableClasses={props.availableClasses || []}
                    error={state.error}
                    needsBoon={state.needsBoon}
                    availablePatrons={state.availablePatrons}
                    selectedPatronUuid={state.selectedPatronUuid}
                    onClassChange={actions.setTargetClassUuid}
                    onPatronChange={actions.setSelectedPatronUuid}
                    foundryUrl={props.foundryUrl}
                    classLocked={!!props.classUuid}
                />

                {/* Main Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">

                    {!state.loadingPatrons && (
                        <>
                            {ClassCard}

                            {state.activeClassObj && (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <HPRollSection
                                            hpRoll={state.hpRoll}
                                            hpFormula={state.hpFormula}
                                            hpMax={state.hpMax}
                                            status={state.statuses.hp}
                                            onRoll={actions.handleRollHP}
                                            onManualChange={actions.setHpRoll}
                                            onClear={() => actions.setHpRoll(0)}
                                        />

                                        {props.currentLevel === 0 && (
                                            <GoldRollSection
                                                goldRoll={state.goldRoll}
                                                goldFormula={state.goldFormula}
                                                goldMax={state.goldMax}
                                                status={state.statuses.gold}
                                                onRoll={actions.handleRollGold}
                                                onManualChange={actions.setGoldRoll}
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
                                        choiceRolls={state.choiceRolls}
                                        talentStatus={state.statuses.talents}
                                        boonStatus={state.statuses.boons}
                                        onRollTalent={actions.handleRollTalent}
                                        onRollBoon={actions.handleRollBoon}
                                        onRemoveTalent={(index) => actions.setRolledTalents(prev => prev.filter((_, i) => i !== index))}
                                        onRemoveBoon={(index) => actions.setRolledBoons(prev => prev.filter((_, i) => i !== index))}
                                        patronName={state.fetchedPatron?.name || state.availablePatrons.find(p => (p.uuid || p._id) === state.selectedPatronUuid)?.name}
                                    />

                                    <SpellSelectionSection
                                        isSpellcaster={state.isSpellcaster}
                                        spellsToChooseTotal={state.spellsToChooseTotal}
                                        spellsToChoose={state.spellsToChoose}
                                        availableSpells={state.availableSpells}
                                        selectedSpells={state.selectedSpells}
                                        status={state.statuses.spells}
                                        onSelectedSpellsChange={actions.setSelectedSpells}
                                    />

                                    {state.extraSpellSelection && state.extraSpellSelection.active && (
                                        <ExtraSpellSelectionSection
                                            active={state.extraSpellSelection.active}
                                            maxTier={state.extraSpellSelection.maxTier}
                                            source={state.extraSpellSelection.source}
                                            availableSpells={state.extraSpellsList}
                                            selectedSpells={state.extraSpellSelection.selected}
                                            status={state.statuses.extraSpells}
                                            onSelectionChange={(selected) => {
                                                actions.setExtraSpellSelection({ ...state.extraSpellSelection, selected });
                                            }}
                                        />
                                    )}



                                    {state.statSelection && state.statSelection.required > 0 && (
                                        <StatSelectionSection
                                            required={state.statSelection.required}
                                            selected={state.statSelection.selected}
                                            onToggle={actions.handleStatToggle}
                                        />
                                    )}

                                    {state.weaponMasterySelection && state.weaponMasterySelection.required > 0 && (
                                        <WeaponSelectionSection
                                            required={state.weaponMasterySelection.required}
                                            selected={state.weaponMasterySelection.selected}
                                            onSelectionChange={(sel: string[]) => actions.setWeaponMasterySelection({ ...state.weaponMasterySelection, selected: sel })}
                                        />
                                    )}

                                    {state.armorMasterySelection && state.armorMasterySelection.required > 0 && (
                                        <ArmorSelectionSection
                                            required={state.armorMasterySelection.required}
                                            selected={state.armorMasterySelection.selected}
                                            onSelectionChange={(sel: string[]) => actions.setArmorMasterySelection({ ...state.armorMasterySelection, selected: sel })}
                                        />
                                    )}

                                    <LanguageSelectionSection
                                        languageGroups={state.languageGroups}
                                        selectedLanguages={state.selectedLanguages}
                                        fixedLanguages={state.fixedLanguages}
                                        knownLanguages={state.knownLanguages}
                                        availableLanguages={props.availableLanguages || []}
                                        status={state.statuses.languages}
                                        onSelectedLanguagesChange={actions.setSelectedLanguages}
                                    />
                                </>
                            )}
                        </>
                    )}
                </div>

                <LevelUpFooter
                    onCancel={props.onCancel}
                    onConfirm={actions.handleConfirm}
                    isComplete={actions.isComplete()}
                    loading={state.loading}
                    targetLevel={props.targetLevel}
                />
            </div>
        </div>
    );
};
