import { NextResponse } from 'next/server';
import { dataManager } from '../data/DataManager';

export async function handleIndex(request: Request) {
    try {
        const index = await dataManager.getIndex();
        return NextResponse.json(index);
    } catch (e: any) {
        console.error('Failed to get Shadowdark index', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
