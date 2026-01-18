'use client';

import RichTextEditor from '@/components/RichTextEditor';

interface NotesTabProps {
    actor: any;
    onUpdate: (path: string, value: any) => void;
}

export default function NotesTab({ actor, onUpdate }: NotesTabProps) {
    // Try to find the notes content
    // Shadowdark stores notes at system.notes (not system.details.notes.value)
    const notesContent = actor.system?.notes || actor.system?.details?.notes?.value || actor.system?.details?.biography?.value || actor.details?.notes || actor.details?.biography || '';

    // Shadowdark uses system.notes for character notes
    const updatePath = 'system.notes';

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
                    onSave={(html) => {
                        console.log('[NOTES TAB] onSave called, path:', updatePath, 'length:', html.length);
                        onUpdate(updatePath, html);
                    }}
                />
            </div>
        </div>
    );
}
