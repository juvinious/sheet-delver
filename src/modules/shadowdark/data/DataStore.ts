import path from 'node:path';
import fs from 'node:fs';
import { logger } from '../../../core/logger';
import { ModulePaths } from '../utils/ModulePaths';

/**
 * Service to handle file-system discovery and indexing of Shadowdark data packs.
 */
export class DataStore {
    /**
     * Scans the packs directory and returns an index of all JSON documents.
     * Also returns a map of table results for hydration.
     */
    static scanPacks(): { index: Map<string, any>, resultsMap: Map<string, any[]> } {
        const index = new Map<string, any>();
        const resultsMap = new Map<string, any[]>();
        const packsDir = ModulePaths.getPacksDir();

        if (!fs.existsSync(packsDir)) {
            logger.warn(`[DataStore] Packs directory not found: ${packsDir}`);
            return { index, resultsMap };
        }

        const system = 'shadowdark';

        const scanDirectory = (dir: string) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    scanDirectory(fullPath);
                } else if (file.endsWith('.json')) {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        const data = JSON.parse(content);

                        const internalKey = data._key || '';
                        const parentDir = path.basename(dir);
                        const packName = parentDir.replace('.db', '');

                        if (file.startsWith('!') || internalKey.startsWith('!')) {
                            if ((file.startsWith('!tables.results!') || internalKey.startsWith('!tables.results!')) && data._id) {
                                const keyToMatch = file.startsWith('!tables.results!') ? file : internalKey;
                                const match = keyToMatch.match(/!tables\.results!([^.]+)\.([^.]+)/);

                                if (match) {
                                    const tableId = match[1];
                                    const resultId = match[2];

                                    index.set(resultId, data);
                                    const embeddedUuid = `Compendium.${system}.${packName}.${tableId}.TableResult.${resultId}`;
                                    index.set(embeddedUuid, data);

                                    if (!resultsMap.has(tableId)) resultsMap.set(tableId, []);
                                    resultsMap.get(tableId)?.push(data);
                                    continue;
                                }
                            } else if ((file.startsWith('!tables!') || internalKey.startsWith('!tables!')) && data._id) {
                                const docType = 'RollTable';
                                const uuidShort = `Compendium.${system}.${packName}.${data._id}`;
                                const uuidLong = `Compendium.${system}.${packName}.${docType}.${data._id}`;

                                data.pack = packName;
                                data.uuid = uuidLong;
                                data.documentType = docType;

                                index.set(uuidShort, data);
                                index.set(uuidLong, data);
                                continue;
                            }
                        }

                        // Regular items/docs
                        const id = data._id || data.id;
                        if (id) {
                            const uuidShort = `Compendium.${system}.${packName}.${id}`;
                            const uuidLong = `Compendium.${system}.${packName}.${data.type || 'Item'}.${id}`;

                            data.pack = packName;
                            data.uuid = uuidLong;
                            data.documentType = data.type || 'Item';

                            index.set(uuidShort, data);
                            index.set(uuidLong, data);
                        }
                    } catch (e) {
                        logger.error(`[DataStore] Failed to parse pack file ${file}:`, e);
                    }
                }
            }
        };

        scanDirectory(packsDir);
        return { index, resultsMap };
    }
}
