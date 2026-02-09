import { NextResponse } from 'next/server';
import { getClient } from '../../core/foundry/instance';
import { logger } from '../../core/logger';
import { ROLL_TABLE_PATTERNS } from '../../modules/shadowdark/data/roll-table-patterns';

/**
 * POST /api/foundry/roll-table
 * Generic roll table handler
 */
export async function handleRollTable(request: Request) {
    try {
        // Use the authenticated client if passed through middleware
        const client = (request as any).foundryClient || getClient();

        if (!client || !client.isConnected) {
            return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        // Support both Next.js Request and Express Request (via middleware)
        let body;
        if ((request as any).body && Object.keys((request as any).body).length > 0) {
            body = (request as any).body;
        } else if (typeof request.json === 'function') {
            body = await request.json();
        } else {
            body = {};
        }

        const { tableUuid, actorId, options = {} } = body;

        if (!tableUuid) {
            return NextResponse.json({ error: 'tableUuid is required' }, { status: 400 });
        }

        // Use CoreSocket's rollTable method which handles system-specific quirks (like Shadowdark stale data)
        const rollResult = await client.rollTable(tableUuid, {
            ...options,
            displayChat: true, // Use CoreSocket's new rich chat capabilities
            rollMode: options.rollMode || 'self' // Default to 'self' (private to user) as requested
        });

        if (!rollResult || !rollResult.results) {
            return NextResponse.json({ error: 'Failed to roll table or no results' }, { status: 500 });
        }

        const { total, results: matches, table } = rollResult;
        const formula = table?.formula || '1d20'; // Fallback if table not returned fully

        logger.info(`[API] Roll total: ${total}, Matches: ${matches.length}`);

        // 4. Transform matches into usable items
        const resolvedItems = [];
        for (const match of matches) {
            // Result Type 2 = Document (Compendium or World)
            // Result Type 1 = Entity (Old foundry style)
            // Result Type 0 = Text
            if (match.type === 2 || match.documentId) {
                const collection = match.documentCollection || match.collection;
                const docId = match.documentId;
                const uuid = `Compendium.${collection}.Item.${docId}`;

                // Fetch full data for the document
                try {
                    const doc = await client.fetchByUuid(uuid);
                    if (doc) {
                        resolvedItems.push({
                            ...doc,
                            _originTable: table.name,
                            _rollTotal: total
                        });
                    } else {
                        // Fallback to text if document not found
                        resolvedItems.push({
                            name: match.text || match.name,
                            type: 'text',
                            description: 'Linked document not found: ' + uuid,
                            _rollTotal: total
                        });
                    }
                } catch (e) {
                    logger.warn(`Failed to fetch linked document ${uuid}:`, e);
                    resolvedItems.push({
                        name: match.text || match.name,
                        type: 'text',
                        _rollTotal: total
                    });
                }
            } else {
                // Text Result
                // Some textual results (like 'Choose 1') only have a description but no name/text property, 
                // or have a weight as text (e.g. "1").
                let textContent = match.text || match.name || "";
                const desc = match.description || "";

                // Exact Text Match from patterns
                // If description matches a known choice instruction and text is empty/numeric, use description
                if (ROLL_TABLE_PATTERNS.CHOICE_INSTRUCTIONS.includes(desc)) {
                    if (!textContent || textContent.length < 3 || !isNaN(Number(textContent))) {
                        textContent = desc;
                    }
                }

                if (!textContent) textContent = desc;

                resolvedItems.push({
                    name: textContent,
                    text: textContent,
                    description: desc, // Ensure description is passed
                    type: 'text',
                    img: match.img,
                    _rollTotal: total,
                    isChoice: ROLL_TABLE_PATTERNS.CHOICE_INSTRUCTIONS.includes(textContent)
                });
            }
        }

        return NextResponse.json({
            success: true,
            total,
            formula,
            items: resolvedItems
        });

    } catch (error: any) {
        logger.error(`[API] Roll Table Error: ${error.message}`);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
