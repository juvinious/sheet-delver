
export const calculateItemSlots = (item: any) => {
    const s = item.system?.slots;
    if (!s) return 0;

    // Handle simple number case
    if (typeof s !== 'object') {
        return Number(s) * (Number(item.system?.quantity) || 1);
    }

    const quantity = Number(item.system?.quantity) || 0;
    const perSlot = Number(s.per_slot) || 1;
    const slotsUsed = Number(s.slots_used) || 0;
    const freeCarry = Number(s.free_carry) || 0;

    const rawCost = Math.ceil(quantity / perSlot) * slotsUsed;
    return Math.max(0, rawCost - freeCarry);
};

export const calculateMaxSlots = (actor: any) => {
    // 1. Base slots = Max(10, STR Score)
    // Try to get score from various paths
    const strObj = actor.system?.abilities?.str || actor.system?.abilities?.STR || actor.stats?.str || actor.stats?.STR || actor.attributes?.str || actor.attributes?.STR;

    // In normalized data (adapter), we might have { val, mod } or just { mod }.
    // Detailed raw actor has system.abilities.str.value.

    // Safest bet: Look for 'value' or 'base' or try to parse the object itself if it is a number.
    const strScore = Number(strObj?.value ?? strObj?.base ?? 10);
    const base = Math.max(10, strScore);

    // 2. Hauler Talent: Add CON mod slots
    const hauler = (actor.items || []).find((i: any) => i.type === 'Talent' && i.name.toLowerCase() === 'hauler');
    let bonus = 0;
    if (hauler) {
        const conObj = actor.system?.abilities?.con || actor.system?.abilities?.CON || actor.stats?.con || actor.stats?.CON || actor.attributes?.con || actor.attributes?.CON;
        bonus = Number(conObj?.mod) || 0;
    }

    return base + bonus;
};

export const calculateCoinSlots = (coins: any) => {
    if (!coins) return 0;
    const total = (Number(coins.gp) || 0) + (Number(coins.sp) || 0) + (Number(coins.cp) || 0);
    return Math.floor(total / 100);
};

export const calculateGemSlots = (gems: any[]) => {
    if (!gems || gems.length === 0) return 0;
    const total = gems.reduce((acc, g) => acc + (Number(g.system?.quantity) || 1), 0);
    return Math.floor(total / 10);
};
