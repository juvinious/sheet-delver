
'use client';

import React, { useEffect, useState, useRef } from 'react';
import { logger } from '../logger';

import { useFoundry } from '@/app/ui/context/FoundryContext';
import { useConfig } from '@/app/ui/context/ConfigContext';

type SharedContent = {
    type: 'image' | 'journal' | null;
    data: any;
    timestamp: number;
};

export function SharedContentModal() {
    const { sharedContent, token } = useFoundry();
    const { resolveImageUrl } = useConfig();
    const [isVisible, setIsVisible] = useState(false);
    const lastTimestampRef = useRef<number>(0);

    const [content, setContent] = useState<SharedContent | null>(null);

    useEffect(() => {
        if (sharedContent && sharedContent.type) {
            // Check if dismissed
            const dismissedTs = sessionStorage.getItem('sheet-delver-dismissed-share');
            if (dismissedTs && parseInt(dismissedTs) === sharedContent.timestamp) {
                return;
            }

            if (sharedContent.timestamp > lastTimestampRef.current) {
                logger.debug('Received new shared content from context:', sharedContent);
                lastTimestampRef.current = sharedContent.timestamp;
                setContent(sharedContent);
                setIsVisible(true);
            }
        }
    }, [sharedContent]);

    if (!isVisible || !content || !content.type) return null;

    const close = () => {
        setIsVisible(false);
        if (content) {
            sessionStorage.setItem('sheet-delver-dismissed-share', content.timestamp.toString());
        }
    };

    // Resolve Image URL
    const imageUrl = content.type === 'image' ? resolveImageUrl(content.data.url) : '';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={close}>
            <div className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>

                <button
                    onClick={close}
                    className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors p-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>

                {content.type === 'image' && (
                    <div className="bg-zinc-900 rounded-lg overflow-hidden shadow-2xl border border-zinc-700">
                        {content.data.title && (
                            <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-center font-bold text-zinc-100">
                                {content.data.title}
                            </div>
                        )}
                        <img
                            src={imageUrl}
                            alt={content.data.title || 'Shared Image'}
                            className="max-h-[80vh] w-auto object-contain"
                        />
                    </div>
                )}

                {content.type === 'journal' && (
                    <div className="bg-zinc-900 rounded-lg overflow-hidden shadow-2xl border border-zinc-700 w-full max-w-2xl h-[80vh] flex flex-col">
                        <div className="px-4 py-3 bg-zinc-800 border-b border-zinc-700 flex justify-between items-center">
                            <h3 className="font-bold text-zinc-100">Journal Entry</h3>
                        </div>
                        <div className="flex-1 p-6 overflow-y-auto text-zinc-300 prose prose-invert max-w-none">
                            <p>Loading Journal {content.data.id}...</p>
                            {/* We would need to fetch the full journal content here ideally, 
                                but for MVP just showing the ID or triggering a fetch is a start. 
                                Actually, let's fetch it if we can. */}
                            {/* Future improvement: Fetch via /api/journals/:id */}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
