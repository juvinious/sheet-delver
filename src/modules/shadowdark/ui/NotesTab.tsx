'use client';

import RichTextEditor from '@/app/ui/components/RichTextEditor';
import { shadowdarkTheme } from '@/modules/shadowdark/ui/themes/shadowdark';

interface NotesTabProps {
    actor: any;
    onUpdate: (path: string, value: any) => void;
    token?: string | null;
}

export default function NotesTab({ actor, onUpdate, token }: NotesTabProps) {

    // Use normalized notes path from system.ts
    const notesContent = actor.details?.notes || '';

    const handleSave = async (html: string) => {
        try {
            const res = await fetch(`/api/modules/shadowdark/actors/${actor.id}/notes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ notes: html })
            });

            if (!res.ok) {
                throw new Error('Failed to save notes');
            }

            // Update local state to reflect the change
            onUpdate('details.notes', html);
        } catch (error) {
            console.error('Error saving notes:', error);
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
