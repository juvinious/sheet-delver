import { SYSTEM_PREDEFINED_EFFECTS, BOON_TYPE_MAP, EFFECT_TRANSLATIONS_MAP } from '../../data/talent-effects';
import { logger } from '@shared/utils/logger';
import { getErrorMessage } from '@server/shared/utils/getErrorMessage';

/**
 * API handler to serve static Shadowdark rule mappings and predefined effects.
 * This is preferred over systemData for these specific constants to keep 
 * the primary data stream lean and reliable.
 */
export async function handleGetCustomMaps(request: Request) {
    try {
        const payload = {
            PREDEFINED_EFFECTS: SYSTEM_PREDEFINED_EFFECTS,
            BOON_TYPES: BOON_TYPE_MAP,
            EFFECT_TRANSLATIONS: EFFECT_TRANSLATIONS_MAP,
            generatedAt: new Date().toISOString()
        };

        return Response.json(payload);
    } catch (error: unknown) {
        logger.error('Failed to generate Shadowdark custom maps', error);
        return Response.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
