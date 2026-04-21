export interface ChatMessageDto {
    id?: string;
    _id?: string;
    user?: string;
    content?: string;
    flavor?: string;
    timestamp?: number;
    isRoll?: boolean;
    rollTotal?: number;
    rollFormula?: string;
    isCritical?: boolean;
    isFumble?: boolean;
    [key: string]: unknown;
}

export interface ChatLogPayload {
    messages: ChatMessageDto[];
}

export interface ChatSendSuccessPayload {
    success: true;
    type: 'roll' | 'chat';
    result?: unknown;
}

export interface ChatErrorPayload {
    error: string;
    status: number;
}
