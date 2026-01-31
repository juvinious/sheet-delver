
import * as shadowdark from '@/modules/shadowdark/server';

export const serverModules: Record<string, { apiRoutes?: Record<string, any> }> = {
    'shadowdark': shadowdark
};
