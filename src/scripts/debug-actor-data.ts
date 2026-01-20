
import { FoundryClient } from '../lib/foundry/client';

async function main() {
    const client = new FoundryClient({
        url: 'http://localhost:30000',
        headless: true
    });

    try {
        await client.connect();
        const actorId = 'n93JSRyao3o2kSva'; // ID from user logs

        const debugInfo = await client.evaluate(async (id) => {
            // @ts-ignore
            const actor = window.game.actors.get(id);
            if (!actor) return { error: 'Actor not found' };

            const type = actor.type;
            const strStat = actor.system.abilities?.str;
            const strBase = strStat?.base;
            const strBonus = strStat?.bonus;

            let apiMod = 'Method Missing';

            // Check API
            // @ts-ignore
            if (typeof actor.abilityModifier === 'function') {
                try {
                    // @ts-ignore
                    apiMod = actor.abilityModifier('str');
                } catch (e: any) {
                    apiMod = `Error: ${e.message}`;
                }
            }

            // Check Raw System Data
            return {
                id,
                name: actor.name,
                type,
                abilities: actor.system.abilities,
                strDebug: {
                    base: strBase,
                    bonus: strBonus,
                    apiResult: apiMod
                },
                proto: actor.constructor.name
            };

        }, actorId);

        console.log(JSON.stringify(debugInfo, null, 2));

    } catch (error) {
        console.error('Debug script failed:', error);
    } finally {
        await client.close();
    }
}

main();
