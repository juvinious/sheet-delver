import type { AppConfig } from '@shared/interfaces';
import type { ChatClientLike, ChatSendBody } from '@server/shared/types/documents';
import type { ChatLogPayload, ChatSendSuccessPayload, ChatErrorPayload } from '@shared/contracts/chat';

interface ChatServiceDeps {
    config: AppConfig;
}

export function createChatService(deps: ChatServiceDeps) {
    // Chat history read model used by the chat feed endpoint.
    const getChatLog = async (client: ChatClientLike, limitParam: unknown): Promise<ChatLogPayload> => {
        const limit = parseInt(limitParam as string) || deps.config.app.chatHistory || 100;
        const messages = await client.getChatLog(limit);
        return { messages };
    };

    // Chat send orchestration with slash-roll command detection and mode normalization.
    const sendChatMessage = async (
        client: ChatClientLike,
        body: ChatSendBody
    ): Promise<ChatSendSuccessPayload | ChatErrorPayload> => {
        const { message } = body;
        if (!message) return { error: 'Message is empty', status: 400 };

        const ROLL_CMD = /^\/(r|roll|gmr|gmroll|br|blindroll|sr|selfroll)(?=\s|$|\d)/i;
        const match = message.trim().match(ROLL_CMD);

        if (match) {
            const cmd = match[1].toLowerCase();
            let rollMode = body.rollMode;
            if (cmd === 'gmr' || cmd === 'gmroll') rollMode = 'gmroll';
            if (cmd === 'br' || cmd === 'blindroll') rollMode = 'blindroll';
            if (cmd === 'sr' || cmd === 'selfroll') rollMode = 'selfroll';
            if (cmd === 'r' || cmd === 'roll') rollMode = 'publicroll';

            const cleanFormula = message.trim().replace(ROLL_CMD, '').trim();
            const result = await client.roll(cleanFormula, undefined, {
                rollMode,
                speaker: body.speaker
            });
            return { success: true, type: 'roll', result };
        }

        await client.sendMessage(message, {
            rollMode: body.rollMode,
            speaker: body.speaker
        });
        return { success: true, type: 'chat' };
    };

    return {
        getChatLog,
        sendChatMessage
    };
}
