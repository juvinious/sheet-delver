
import * as shadowdark from '@/modules/shadowdark/server';
import * as morkborg from '@/modules/morkborg/server';

export const serverModules: Record<string, { apiRoutes?: Record<string, any> }> = {
    'shadowdark': shadowdark,
    'morkborg': morkborg
};
