import { logger } from '../../../core/logger';
import { shadowdarkAdapter } from '../system';
import { ROLL_TABLE_FILTER, ROLL_TABLE_TALENT_MAP, ROLL_TABLE_PATRON_BOONS } from '../data/roll-table-patterns';
import { TALENT_HANDLERS } from '../api/talent-handlers';

export interface ProcessedRollResult {
    item: any | null;
    needsChoice: boolean;
    choiceOptions: any[];
    choiceCount: number;
    action?: string;
    config?: any;
}

/**
 * Service to process roll results from Shadowdark tables, 
 * applying bitmask-based filtering and hydration.
 */
export class TableService {
    /**
     * Processes a single roll result (or set of results) from a table.
     */
    static async processRollResult(client: any, { result, table }: { result: any; table: any }): Promise<ProcessedRollResult> {
        logger.info(`[TableService] processRollResult for table: ${table?.name}`, { result });
        const matchedItems = result.items || [];
        const matchedResults = result.results || [];

        let item = matchedItems.length > 0 ? { ...matchedItems[0] } : null;
        let needsChoice = false;
        let choiceOptions: any[] = [];
        let choiceCount = 1;

        // 1. Find pattern for this table
        let rollPatterns = Object.values(ROLL_TABLE_TALENT_MAP).find((t: any) => t.UUID === table?.uuid);
        if (!rollPatterns) {
            rollPatterns = Object.values(ROLL_TABLE_PATRON_BOONS).find((t: any) => t.UUID === table?.uuid);
        }

        if (rollPatterns) {
            const pattern = rollPatterns.map.find((p: any) =>
                p.range[0] <= result.total && p.range[1] >= result.total
            );
            const filter = pattern?.filter || ROLL_TABLE_FILTER.None;

            logger.debug(`[TableService] Applying Filter: ${filter} for Table: ${table?.name}`);

            // 2. Apply Bitmask Filters
            
            // ChooseTwoInstead
            if ((filter & ROLL_TABLE_FILTER.ChooseTwoInstead) !== 0) {
                if (table?.results) {
                    choiceOptions = table.results;
                    needsChoice = true;
                    choiceCount = 2;
                }
            }
            // DropChooseOne | ChooseOne | HasDistributeStatsTable
            else if ((filter & (ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable)) === (ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable)) {
                item = await this.createSyntheticChoiceHeader(table, matchedResults);
                choiceOptions = this.extractChoicesFromResults(matchedResults, true);
                needsChoice = true;
            }
            // DropChooseOne | ChooseOne
            else if ((filter & (ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne)) === (ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne)) {
                choiceOptions = this.extractChoicesFromResults(matchedResults, false);
                needsChoice = true;
            }
            // Distribute Stats
            else if ((filter & (ROLL_TABLE_FILTER.DropTwoPointsToDistribute | ROLL_TABLE_FILTER.DistributeTwoStatsAny)) || (filter & ROLL_TABLE_FILTER.DistributeTwoStatsOnlyOnce)) {
                item = this.createSyntheticDistributeStats();
                needsChoice = false;
            }
            // Patron Boons
            else if ((filter & ROLL_TABLE_FILTER.RollAnyPatronBoon) || (filter & ROLL_TABLE_FILTER.RollPatronBoon)) {
                item = this.createSyntheticPatronBoon();
                needsChoice = false;
            }
            else if (filter & ROLL_TABLE_FILTER.RollPatronBoonTwice) {
                item = { ...this.createSyntheticPatronBoon(), name: "Patron Boon (x2)", type: "PatronBoonTwice" };
                needsChoice = false;
            }
            // Warlock Specific
            else if (filter & ROLL_TABLE_FILTER.WarlockSpecificTwelve) {
                choiceOptions = this.extractChoicesFromResults(matchedResults, true);
                needsChoice = true;
            }
        }

        // 3. Hydrate Documents
        if (item) item = await this.resolveItem(client, item);

        if (choiceOptions.length > 0) {
            const resolved = [];
            for (const opt of choiceOptions) {
                const res = await this.resolveItem(client, opt);
                if (res) {
                    res.text = res.text || res.name || "Unknown Option";
                    this.attachHandlerData(res);
                }
                resolved.push(res);
            }
            choiceOptions = resolved;
        }

        // 4. Attach Handler Data
        let action, config;
        if (item && !needsChoice) {
            const handler = this.findHandler(item);
            action = handler?.action;
            config = handler?.config;
        }

        return { item, needsChoice, choiceOptions, choiceCount, action, config };
    }

    private static async resolveItem(client: any, target: any) {
        if (!target) return null;
        const type = String(target.type || "");
        if (type === 'document' || type === '2') {
            const uuid = target.documentUuid || target.uuid;
            if (uuid) {
                const resolved = await shadowdarkAdapter.resolveDocument(client, uuid);
                if (resolved) {
                    const clean = JSON.parse(JSON.stringify(resolved));
                    if (target.text && !clean.name) clean.name = target.text;
                    return clean;
                }
            }
        }
        return target;
    }

    private static extractChoicesFromResults(results: any[], mapDistribute: boolean): any[] {
        const raw = results.filter(r => {
            const name = (r.text || r.name || "").toLowerCase();
            if (!name.trim()) return false;
            return !name.includes("choose 1") && !name.includes("choose one") && !name.includes("or (can");
        }).map(r => {
            if (mapDistribute) {
                const name = (r.text || r.name || "").toLowerCase();
                if (name.includes("+2 points") || name.includes("distribute") || name.includes("+2 to") || name.includes("+1 to")) {
                    return this.createSyntheticDistributeStats(true);
                }
                if (name.includes("patron boon")) {
                    return this.createSyntheticPatronBoon();
                }
            }
            return { ...r, name: r.text || r.name || "Unknown Option" };
        });

        const unique = new Map();
        for (const opt of raw) {
            const key = (opt.name || "").toLowerCase().trim();
            if (!unique.has(key)) unique.set(key, opt);
        }
        return Array.from(unique.values());
    }

    private static attachHandlerData(item: any) {
        const handler = this.findHandler(item);
        if (handler) {
            item.action = handler.action;
            item.config = handler.config;
        }
    }

    private static findHandler(item: any) {
        return TALENT_HANDLERS.find(h => h.matches(item));
    }

    private static createSyntheticDistributeStats(isChoice = false) {
        return {
            _id: isChoice ? "synthetic-distribute-stats-choice" : "synthetic-distribute-stats",
            name: "Distribute to Stats",
            type: "synthetic",
            img: "icons/sundries/gaming/dice-pair-white-green.webp",
            text: "Distribute 2 points to any stats."
        };
    }

    private static createSyntheticPatronBoon() {
        return {
            _id: "synthetic-patron-boon",
            name: "Patron Boon",
            type: "PatronBoon",
            img: "icons/magic/symbols/question-stone-yellow.webp",
            text: "Roll on your patron's boon table."
        };
    }

    private static async createSyntheticChoiceHeader(table: any, results: any[]) {
        const instr = results.find(r => {
            const n = (r.text || r.name || "").toLowerCase();
            return n.includes("choose 1") || n.includes("choose one");
        });
        return {
            _id: "synthetic-choice-parent",
            name: instr?.text || "Choose One",
            type: "synthetic",
            img: table.img,
            text: "Select one option from the list below."
        };
    }
}
