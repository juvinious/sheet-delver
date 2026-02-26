export const shadowdarkTheme = {
    chat: {
        container: "bg-white border-2 border-black",
        header: "text-black text-sm font-bold uppercase mb-4 border-b-2 border-black pb-2 font-serif tracking-widest",
        msgContainer: (isRoll: boolean) => `p-2 border-2 border-black mb-1 shadow-sm ${isRoll ? 'bg-neutral-100' : 'bg-white'}`,
        user: "font-serif font-bold text-black text-xs uppercase tracking-wider",
        time: "text-[9px] uppercase font-bold text-neutral-400 tracking-widest",
        flavor: "text-xs italic text-neutral-600 mb-0.5 font-serif leading-tight",
        content: "text-sm text-black font-serif leading-relaxed messages-content [&_*]:!m-0 [&_*]:!p-0 [&_p]:mb-0.5 [&_br]:hidden [&_img]:max-w-[48px] [&_img]:max-h-[48px] [&_img]:inline-block [&_img]:border-2 [&_img]:border-black [&_img]:grayscale [&_img]:contrast-125 [&_.chat-card]:!block [&_.chat-card]:bg-white [&_.chat-card]:border-2 [&_.chat-card]:border-black [&_.chat-card]:my-1 [&_.chat-card]:shadow-[1px_1px_0_0_rgba(0,0,0,1)] [&_.chat-card-header]:!block [&_.chat-card-header]:bg-black [&_.chat-card-header]:text-white [&_.chat-card-header]:px-2 [&_.chat-card-header]:py-0.5 [&_.chat-card-header]:font-bold [&_.chat-card-header]:uppercase [&_.chat-card-header]:text-[9px] [&_.chat-card-header]:tracking-widest [&_.chat-card-content]:!block [&_.chat-card-content]:p-0.5 [&_.chat-card-row]:!flex [&_.chat-card-row]:!flex-row [&_.chat-card-row]:!items-center [&_.chat-card-row]:!justify-start [&_.chat-card-row]:gap-2 [&_.chat-card-row]:p-0.5 [&_.chat-card-row]:border-b [&_.chat-card-row]:border-black/5 [&_.chat-card-row:last-child]:border-none [&_.chat-card-text]:!inline [&_.chat-card-text]:font-bold [&_.chat-card-text]:text-[11px] [&_.chat-card-text]:leading-tight [&_.chat-card-image]:!inline-block [&_.chat-card-image]:border-none [&_.chat-card-image]:grayscale-0 [&_.chat-card-image]:contrast-100 [&_.chat-card-image]:w-5 [&_.chat-card-image]:h-5 [&_.chat-card-image]:!shrink-0",
        rollResult: "mt-1 bg-white text-black p-1.5 text-center border-2 border-black",
        rollFormula: "text-[9px] uppercase tracking-widest text-neutral-500",
        rollTotal: "text-xl font-bold font-serif",
        button: "inline-flex items-center gap-1 bg-white hover:bg-black group border-2 border-black px-2 py-0.5 text-xs font-bold text-black hover:text-white transition-colors cursor-pointer my-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none active:translate-y-[2px] rounded-lg",
        buttonText: "uppercase font-sans tracking-widest",
        buttonValue: "font-serif font-bold group-hover:text-white",
        scrollButton: "bg-white hover:bg-black border-2 border-black px-3 py-1.5 text-xs font-bold text-black hover:text-white transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none active:translate-y-[2px] uppercase tracking-widest",
        inputContainer: "col-span-2 flex gap-2 p-1 bg-neutral-50 border-t-2 border-black mt-2",
        inputField: "flex-1 bg-white border-2 border-black rounded-none px-3 py-1.5 text-sm font-serif focus:outline-none focus:bg-neutral-50 text-black placeholder:text-neutral-400",
        sendBtn: "bg-black hover:bg-neutral-800 text-white px-4 py-1.5 rounded-none text-xs font-bold font-serif transition-colors uppercase tracking-widest shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none active:translate-y-[2px]"
    },
    diceTray: {
        container: "bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4",
        header: "text-black text-sm font-bold uppercase border-b-2 border-black pb-2 font-serif tracking-widest mb-4",
        textarea: "w-full h-24 bg-white border-2 border-black p-3 font-serif text-lg text-black focus:bg-neutral-50 outline-none resize-none",
        clearBtn: "absolute top-2 right-2 text-xs text-neutral-400 hover:text-red-600 uppercase font-bold font-serif",
        diceRow: "flex flex-wrap justify-between gap-2 bg-neutral-50 p-2 border-2 border-black mb-4",
        diceBtn: "w-10 h-10 flex items-center justify-center bg-white hover:bg-black hover:text-white active:bg-neutral-200 border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-y-[2px] text-xs font-bold font-serif transition-all text-black",
        modGroup: "flex gap-1",
        modBtn: "px-3 py-2 bg-white border-2 border-black rounded-lg hover:bg-black hover:text-white font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-y-[2px] transition-all font-serif text-black hover:text-white",
        rollModeGroup: "flex gap-1 mb-2",
        rollModeBtn: (active: boolean) => `flex-1 flex items-center justify-center p-2 border-2 border-black transition-all ${active ? 'bg-black text-white shadow-none translate-y-[1px]' : 'bg-white text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-neutral-50'}`,
        advGroup: "flex bg-neutral-50 border-2 border-black p-1",
        advBtn: (active: boolean, type: 'normal' | 'adv' | 'dis') => {
            const base = "px-2 py-1 text-xs font-bold transition-all font-serif ";
            if (!active) return base + "text-neutral-500 hover:text-black";
            if (type === 'normal') return base + "bg-black text-white";
            if (type === 'adv') return base + "bg-green-600 text-white";
            return base + "bg-red-600 text-white";
        },
        sendBtn: "flex-1 bg-black hover:bg-neutral-800 text-white font-bold uppercase tracking-widest py-3 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-y-[2px] transition-all text-xl font-serif",
        helpText: "text-[10px] text-neutral-400 text-center mt-2 uppercase tracking-widest font-bold"
    },
    modal: {
        overlay: "absolute inset-0 bg-black/60 backdrop-blur-sm",
        container: "relative z-10 bg-black border-[4px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-md animate-in fade-in zoom-in-95 duration-200 overflow-hidden",
        header: "bg-black p-4 flex justify-between items-center",
        title: "font-serif font-bold text-xl uppercase tracking-widest text-white",
        body: "bg-white p-6 border-t-[4px] border-black text-neutral-900 font-serif leading-relaxed min-h-[100px]",
        footer: "bg-white p-4 flex justify-end gap-3",
        confirmBtn: (isDanger?: boolean) => `px-6 py-2 font-bold font-serif uppercase tracking-widest text-xs text-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all rounded-none ${isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-black hover:bg-neutral-800'}`,
        cancelBtn: "px-4 py-2 font-bold font-serif uppercase tracking-widest text-xs border-2 border-neutral-300 hover:border-black transition-colors rounded-none text-neutral-600 hover:text-black hover:bg-neutral-50",
        closeBtn: "text-white hover:text-amber-500 transition-colors"
    },
    rollDialog: {
        overlay: "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity",
        container: "w-full max-w-md relative z-10 bg-black border-[4px] border-black shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden",
        header: "bg-black p-4 flex justify-between items-center",
        title: "font-serif text-xl font-bold uppercase tracking-widest text-white mx-auto",
        body: "bg-white p-6 border-t-[4px] border-black space-y-4",
        inputGroup: "grid grid-cols-3 items-center gap-4",
        label: "col-span-1 font-bold text-xs uppercase tracking-widest text-neutral-500",
        input: "col-span-2 p-2 border-2 border-black font-serif text-lg outline-none focus:bg-neutral-50 transition-colors text-black",
        footer: "bg-white p-6 border-t-2 border-neutral-100 flex flex-col gap-2",
        rollBtn: (mode: 'normal' | 'adv' | 'dis') => {
            const base = "flex-1 py-3 px-4 uppercase font-bold text-sm border-2 border-black transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px] active:shadow-none font-serif tracking-wider rounded-none ";
            if (mode === 'normal') return base + "bg-black text-white hover:bg-neutral-800";
            if (mode === 'adv') return base + "bg-white text-green-700 hover:bg-green-50";
            return base + "bg-white text-red-700 hover:bg-red-50";
        },
        closeBtn: "text-white hover:text-amber-500 transition-colors",
        select: "w-full p-2 border-2 border-black font-serif text-lg outline-none appearance-none bg-white cursor-pointer hover:bg-neutral-50 transition-colors text-black",
        selectArrow: "absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-black"
    },
    loadingModal: {
        overlay: "absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity",
        container: "relative z-10 p-8 bg-white border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] text-center space-y-4 max-w-sm w-full mx-4",
        spinner: "w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin mx-auto",
        text: "text-xl font-bold text-black font-serif uppercase tracking-widest"
    },
    globalChat: {
        window: "bg-white border-[4px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]",
        header: "bg-black border-b-[4px] border-black p-3 flex justify-between items-center",
        title: "text-white font-serif font-bold uppercase tracking-widest text-[12px]",
        diceWindow: "w-[400px]",
        chatWindow: "w-[400px] h-[80vh]",
        toggleBtn: (isOpen: boolean, isDice?: boolean) => {
            const base = "h-14 w-14 flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 border-2 border-white/10 shadow-lg rounded-full ";
            if (isDice) {
                return base + (isOpen ? 'bg-white/10 text-white rotate-90' : 'bg-neutral-900 text-white hover:bg-black');
            }
            return base + (isOpen ? 'bg-white/10 text-white rotate-90' : 'bg-amber-500 text-black hover:bg-amber-400');
        },
        closeBtn: "text-white hover:text-amber-500 transition-colors"
    },
    richText: {
        container: 'relative group h-full flex flex-col',
        toolbar: {
            container: 'bg-black border-b-2 border-neutral-800 p-2 flex flex-wrap gap-1 items-center sticky top-0 z-10 shadow-sm',
            button: 'p-2 rounded hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-white',
            buttonActive: 'p-2 rounded hover:bg-neutral-800 transition-colors bg-neutral-700 text-white',
            separator: 'w-px h-6 bg-neutral-700 mx-1',
            actionButton: 'px-3 py-1 text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-white hover:bg-neutral-800 rounded mr-2',
            saveButton: 'px-3 py-1 text-xs font-bold uppercase tracking-widest bg-white text-black hover:bg-neutral-200 rounded flex items-center gap-1'
        },
        editor: 'prose prose-sm font-serif max-w-none focus:outline-none min-h-[300px] p-4 text-neutral-300',
        editButton: 'bg-black text-white px-6 py-2 font-serif font-bold uppercase tracking-widest border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all flex items-center gap-2'
    }
};
