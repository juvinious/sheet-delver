import { strict as assert } from 'node:assert';
import { createActorService } from '@server/services/actors/ActorService';
import { createCombatService } from '@server/services/combats/CombatService';

async function runActorReadWriteSmoke() {
    const normalizeCalls: Array<{ ids: string[] }> = [];
    const createActorCalls: Array<Record<string, unknown>> = [];

    const actorService = createActorService({
        normalizeActors: async (actorList) => {
            normalizeCalls.push({ ids: actorList.map((actor) => String(actor._id || actor.id)) });
            return actorList.map((actor) => ({
                _id: actor._id,
                id: actor.id,
                name: actor.name,
                type: actor.type,
            }));
        },
        config: {
            debug: { enabled: false, level: 2 },
        } as any,
    });

    const actorClient = {
        userId: 'user-1',
        url: 'http://localhost:30000',
        getSystem: async () => ({ id: 'generic' }),
        getActors: async () => ([
            {
                _id: 'actor-owned',
                id: 'actor-owned',
                name: 'Owned Hero',
                type: 'character',
                ownership: { 'user-1': 3, default: 0 },
            },
            {
                _id: 'actor-readonly',
                id: 'actor-readonly',
                name: 'Observed Ally',
                type: 'character',
                ownership: { default: 2 },
            },
            {
                _id: 'actor-npc',
                id: 'actor-npc',
                name: 'Hidden Goblin',
                type: 'npc',
                ownership: { default: 2 },
            },
        ]),
        createActor: async (payload: Record<string, unknown>) => {
            createActorCalls.push(payload);
            return { _id: 'new-actor-id', name: payload.name };
        },
    } as any;

    const listPayload = await actorService.listActors(actorClient);
    assert.equal(listPayload.system, 'generic');
    assert.equal(listPayload.ownedActors.length, 1);
    assert.equal(listPayload.readOnlyActors.length, 1);
    assert.equal(listPayload.ownedActors[0].name, 'Owned Hero');
    assert.equal(listPayload.readOnlyActors[0].name, 'Observed Ally');
    assert.equal(normalizeCalls.length, 3);

    const createPayload = {
        name: 'Smoke Actor',
        type: 'character',
        items: [
            {
                name: 'Bad Effect Item',
                effects: ['invalid-effect-id'],
                system: {
                    removeMe: [],
                    keepMe: [123],
                },
            },
        ],
    } as Record<string, unknown>;

    const createResult = await actorService.createActor(actorClient, createPayload);

    assert.equal(createResult.success, true);
    assert.equal(createResult.id, 'new-actor-id');
    assert.equal(createActorCalls.length, 1);
    const forwarded = createActorCalls[0] as any;
    assert.deepEqual(forwarded.items[0].effects, []);
    assert.equal(Object.prototype.hasOwnProperty.call(forwarded.items[0].system, 'removeMe'), false);
    assert.deepEqual(forwarded.items[0].system.keepMe, [123]);
}

async function runCombatReadActionSmoke() {
    const normalizeCalls: Array<{ ids: string[] }> = [];
    const dispatchCalls: Array<{ collection: string; action: string; payload: unknown }> = [];

    const combatService = createCombatService({
        normalizeActors: async (actorList) => {
            normalizeCalls.push({ ids: actorList.map((actor) => String(actor._id || actor.id)) });
            return actorList.map((actor) => ({ ...actor, normalized: true }));
        },
    });

    const combatClient = {
        userId: 'gm-1',
        getCombats: async () => ([
            {
                _id: 'combat-1',
                id: 'combat-1',
                round: 0,
                turn: -1,
                combatants: [
                    { _id: 'c1', id: 'c1', actorId: 'actor-a', initiative: 15 },
                    { _id: 'c2', id: 'c2', actorId: 'actor-b', initiative: 12 },
                ],
            },
        ]),
        getActor: async (id: string) => ({
            _id: id,
            id,
            name: `Actor ${id}`,
            ownership: { 'gm-1': 3 },
        }),
        getUsers: async () => ([
            { _id: 'gm-1', id: 'gm-1', role: 4 },
        ]),
        dispatchDocumentSocket: async (collection: string, action: string, payload: unknown) => {
            dispatchCalls.push({ collection, action, payload });
        },
    } as any;

    const listPayload = await combatService.listCombats(combatClient);
    assert.equal(listPayload.success, true);
    assert.equal(listPayload.combats.length, 1);
    assert.equal(listPayload.combats[0].combatants?.[0].actor?.name, 'Actor actor-a');
    assert.equal(normalizeCalls.length, 1);

    const turnResult = await combatService.advanceTurn(combatClient, 'combat-1');
    if ('error' in turnResult) {
        assert.fail(`Expected combat turn success, got error: ${turnResult.error}`);
    }

    assert.equal(turnResult.success, true);
    assert.equal(turnResult.round, 1);
    assert.equal(turnResult.turn, 0);
    assert.equal(dispatchCalls.length, 1);
    assert.equal(dispatchCalls[0].collection, 'Combat');
    assert.equal(dispatchCalls[0].action, 'update');
    assert.deepEqual(dispatchCalls[0].payload, {
        updates: [{ _id: 'combat-1', round: 1, turn: 0 }],
    });
}

export async function run() {
    await runActorReadWriteSmoke();
    await runCombatReadActionSmoke();
}

if (import.meta.url === `file://${process.argv[1]}`) {
    run()
        .then(() => console.log('actor-combat-smoke.test.ts passed'))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
