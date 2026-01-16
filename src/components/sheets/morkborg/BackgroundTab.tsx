import { useRef } from 'react';

interface BackgroundTabProps {
    actor: any;
    onUpdate: (path: string, value: any) => void;
}

export default function BackgroundTab({ actor, onUpdate }: BackgroundTabProps) {
    const descriptionRef = useRef(actor.system?.biography || '');

    const handleBlur = () => {
        if (descriptionRef.current !== actor.system?.biography) {
            onUpdate('system.biography', descriptionRef.current);
        }
    };

    return (
        <div className="h-full flex flex-col gap-6 p-1">
            <div className="bg-black text-amber-500 p-4 transform -rotate-1 shadow-lg border-2 border-amber-500/20">
                <h3 className="font-morkborg text-3xl uppercase tracking-widest text-center mb-4 border-b-2 border-stone-800 pb-2">
                    Background & Biography
                </h3>
            </div>

            <div className="flex-1 bg-neutral-900/50 p-6 rounded-sm border border-stone-800">
                <textarea
                    className="w-full h-96 bg-transparent text-lg font-serif text-neutral-300 focus:outline-none resize-none leading-relaxed italic placeholder:not-italic"
                    placeholder="Describe the wretch..."
                    defaultValue={actor.system?.biography || ''}
                    onChange={(e) => descriptionRef.current = e.target.value}
                    onBlur={handleBlur}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center font-morkborg text-xl text-neutral-500">
                <div className="p-4 border border-stone-800 rounded bg-black/20">
                    <p className="text-amber-700/50 uppercase text-sm mb-1 font-sans tracking-widest">Class</p>
                    <span className="text-neutral-300">{actor.system?.class?.name || 'Unknown Scum'}</span>
                </div>
                {/* Ancestry/Origin if available in MB? Usually just implicit in bio */}
            </div>
        </div>
    );
}
