'use client';

// Basic Notes Tab - implementing a simple textarea for now as we don't have a rich text editor component yet.
// Assumes 'system.details.notes' or 'system.biography' or similar. 
// Based on standard Foundry fields, it's often 'system.details.biography.value' or 'system.details.notes.value'.
// We'll check the actor object in the main sheet if needed, but for now we'll target 'system.details.notes'.

interface NotesTabProps {
    actor: any;
    onUpdate: (path: string, value: any) => void;
}

export default function NotesTab({ actor, onUpdate }: NotesTabProps) {
    // Try to find the notes content
    const notesContent = actor.system?.details?.notes?.value || actor.system?.details?.biography?.value || actor.details?.notes || actor.details?.biography || '';

    return (
        <div className="h-full flex flex-col gap-4">
            <div className="bg-white border-2 border-black p-4 shadow-sm h-full flex flex-col">
                <h3 className="font-serif font-bold text-lg border-b-2 border-black pb-1 mb-3 uppercase tracking-wide">
                    Notes & Biography
                </h3>
                <textarea
                    className="w-full flex-1 p-2 bg-neutral-50 border border-neutral-300 focus:border-black outline-none font-serif leading-relaxed resize-none"
                    defaultValue={notesContent.replace(/<[^>]*>/g, '')} // Strip HTML for textarea editing
                    placeholder="Enter character notes here..."
                    onBlur={(e) => {
                        // Simple update - might need to wrap in <p> if Foundry expects HTML
                        // For Shadowdark system specifics, we might need to adjust.
                        // Using safe update path.
                        onUpdate('system.details.notes', e.target.value);
                    }}
                />
                <p className="text-[10px] text-neutral-400 mt-2 italic">
                    * Simple text editor. HTML formatting will be stripped.
                </p>
            </div>
        </div>
    );
}
