# Roll Table System

## Overview
Unlike standard Foundry VTT interactions, SheetDelver implements its own **Headless Roll Table engine**. Instead of requesting a "draw" from the Foundry socket (which often fails due to stale database indices in exported modules), SheetDelver resolves and rolls on tables locally using the `DataManager`.

> [!IMPORTANT]
> The Roll Table system is currently **Shadowdark-centric**. Data is sourced from the local `src/modules/shadowdark/data/packs` directory and indexed by the `DataManager`.

---

## 1. Local Draw Logic
Rolling is performed entirely on the backend server. The `DataManager` simulates the roll and resolves the result against its local index.

### `DataManager.draw(uuidOrName, rollOverride?)`
- **Resolution**: Finds the table by UUID or Name in the local index.
- **Rolling**: Uses `Math.random` to generate a result (defaulting to 2d12 for Shadowdark tables unless specified).
- **Expansion**: Automatically resolve result "links" (type 'document') into full JSON data from the local packs.

---

## 2. Architecture: DataManager

The `DataManager` (`src/modules/shadowdark/data/DataManager.ts`) is responsible for:
1.  **Indexing**: Scanning the `.db` (JSON) files in the data packs.
2.  **Hydration**: Reconstructing `RollTable` objects by linking their `TableResult` children (marked with `!tables.results!`).
3.  **Drawing**: A logic-heavy method that handles ranges, weights, and recursive document resolution.

---

## 3. API Integration
The roll table API routes are implemented as part of the Shadowdark module's route registry in `src/modules/shadowdark/server.ts`.

### Unified Interface
The API provides a standard interface for the UI via module-prefixed routes:
- `GET /api/modules/shadowdark/roll-table`: List all indexed tables.
- `GET /api/modules/shadowdark/roll-table/:id`: Get full table metadata.
- `POST /api/modules/shadowdark/roll-table/:id/draw`: Execute a local draw and return hydrated results.

---

## 4. Why Local?
Foundry v13 modules (especially system-specific ones like Shadowdark) often contain "broken" roll tables in their compendium exports where the internal result IDs don't match the live server's expected indices. By rolling locally against the source JSON packs, SheetDelver ensures 100% data integrity and allows for complex "Choice" logic during level-ups (Weapon Mastery, Boons, etc.) that would be difficult to coordinate via standard socket events.
