'use client';

import React from 'react';
import { X } from 'lucide-react';
import RichTextEditor from '@/app/ui/components/RichTextEditor';

interface NotesModalProps {
    isOpen: boolean;
    onClose: () => void;
    actor: any;
    onUpdate: (path: string, value: any) => void;
    token?: string | null;
}

export default function NotesModal({
    isOpen,
    onClose,
    actor,
    onUpdate,
    token
}: NotesModalProps) {
    if (!isOpen) return null;

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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-white border-4 border-black w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] relative"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-black p-4 flex justify-between items-center text-white">
                    <h2 className="text-xl font-serif font-bold tracking-wider uppercase">Character Notes</h2>
                    <button onClick={onClose} className="p-1 hover:bg-neutral-800 rounded-full transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-hidden flex-1 flex flex-col">
                    <RichTextEditor
                        content={notesContent}
                        onSave={handleSave}
                    />
                </div>

                {/* Footer */}
                <div className="p-4 bg-neutral-100 border-t-4 border-black flex justify-end">
                    <button
                        onClick={onClose}
                        className="flex items-center justify-center gap-2 px-6 py-2 border-2 border-black bg-white text-black font-bold uppercase tracking-tighter text-xs transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-neutral-200 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
