'use client';

import RichTextEditor from '@client/ui/components/RichTextEditor';
import { shadowdarkTheme } from '@modules/shadowdark/src/ui/themes/shadowdark';
import { logger } from '@shared/utils/logger';

import { useShadowdarkActor } from './context/ShadowdarkActorContext';
import { useShadowdarkUI } from './context/ShadowdarkUIContext';

interface NotesTabProps {
}

export default function NotesTab({ }: NotesTabProps) {
    const { token } = useShadowdarkUI();
    const { actor, updateActor, getDraftValue } = useShadowdarkActor();

    const notesContent = getDraftValue('system.notes', actor.details?.notes || '');

    const handleSave = async (html: string) => {
        try {
            await updateActor('system.notes', html, { immediate: true });
        } catch (error) {
            logger.error('Error saving notes:', error);
            throw error;
        }
    };

    return (
        <div className="h-full flex flex-col gap-4 pb-20">
            {/* Header matching Talents Tab */}
            <div className="bg-black text-white p-2 font-serif font-bold text-xl uppercase tracking-wider flex justify-between items-center shadow-md">
                <span>Character Notes</span>
            </div>

            {/* Content Area - White box with black border */}
            <div className="bg-white border-black border-2 shadow-sm flex-1 flex flex-col overflow-hidden relative text-black">
                <RichTextEditor
                    content={notesContent}
                    onSave={handleSave}
                    theme={shadowdarkTheme.richText}
                    editButtonText="Edit Notes"
                />
            </div>
        </div>
    );
}
