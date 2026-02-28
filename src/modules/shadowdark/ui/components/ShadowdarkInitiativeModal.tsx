import React from 'react';
import RollDialog from '@/app/ui/components/RollDialog';
import { ShadowdarkAdapter } from '../../system';
import { shadowdarkTheme } from '../themes/shadowdark';

export default function ShadowdarkInitiativeModal(props: any) {
    const { isOpen, title, onClose, onConfirm, actor, theme } = props;

    // Use the adapter to securely get the standardized formula from the actor
    const adapter = new ShadowdarkAdapter();
    const rawFormula = actor ? adapter.getInitiativeFormula(actor) : '1d20';

    // Parse out the modifier. Ex: "1d20+2" or "2d20kh1+2"
    let modifier = 0;
    if (rawFormula) {
        // Ensure we don't accidentally match the '1' in '2d20kh1' if there is no modifier
        // Standard dice notation usually ends with +X or -X.
        const modMatch = rawFormula.match(/([+-]\s*[-+]?\d+)$/);
        if (modMatch) {
            modifier = parseInt(modMatch[1].replace(/\s/g, ''), 10);
        }
    }

    // Detect advantage/disadvantage from the formula
    let initialAdvantageMode: 'normal' | 'advantage' | 'disadvantage' = 'normal';
    if (rawFormula?.includes('2d20kh1')) initialAdvantageMode = 'advantage';
    if (rawFormula?.includes('2d20kl1')) initialAdvantageMode = 'disadvantage';


    return (
        <RollDialog
            isOpen={isOpen}
            title={title || 'Roll Initiative'}
            type="ability"
            actor={actor}
            defaults={{
                abilityBonus: modifier,
                showItemBonus: false,
                advantageMode: initialAdvantageMode
            }}
            theme={shadowdarkTheme.rollDialog}
            onConfirm={onConfirm}
            onClose={onClose}
        />
    );
}
