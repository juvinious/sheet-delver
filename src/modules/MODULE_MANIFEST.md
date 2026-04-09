# Module Manifest & Directory Structure

All system-specific modules in `src/modules/` MUST adhere to this standardized architecture to ensure clean domain separation, build-time safety, and registry compatibility.

## 1. Directory Blueprint

```text
module-dir/
├── info.json          # Module metadata & manifest pointers
├── module/            # PUBLIC entry points (Thin re-exports)
│   ├── ui.tsx         # Browser-safe UI manifest
│   ├── logic.ts       # Server-side logic/adapter re-export
│   └── server.ts      # Server-side API/handler re-export
└── src/               # PRIVATE implementation
    ├── ui/            # React components & themes
    ├── logic/         # System Adapter & rule evaluations
    ├── server/        # Specialized API handlers & importers
    └── data/          # In-memory caches & managers
```

## 2. Entry Point Definitions

### `module/ui.tsx` (Frontend)
Must export a `UIModuleManifest` as the **default export**. This file must be **browser-safe** and uses `React.lazy` for component imports to ensure small bundle sizes.
- **Path in info.json**: `manifest.ui`

### `module/logic.ts` (Shared/Server Logic)
Must export the `SystemAdapter` implementation as a named export `Adapter`. This is used by the `registry` to resolve character sheet logic and calculations.
- **Path in info.json**: `manifest.logic`

### `module/server.ts` (Server-Only Handlers)
Optional. Re-exports API initialization or specialized server-only logic (e.g., importers). Explicitly gated by the core registry to prevent Node.js leaks into the browser.
- **Path in info.json**: `manifest.server`

## 3. Manifest Configuration (`info.json`)

```json
{
    "id": "my-system-id",
    "title": "My Awesome RPG",
    "manifest": {
        "ui": "module/ui",
        "logic": "module/logic",
        "server": "module/server"
    },
    "discovery": {
        "packs": [
            { "id": "system.items", "type": "Item", "hydrate": true },
            { "id": "system.tables", "type": "RollTable", "hydrate": false }
        ]
    }
}
```

## 4. Discovery & Data Persistence

The Core Discovery Service automatically synchronizes, hashes, and shards compendium data based on the `discovery` block in `info.json`.

### `PackDiscoveryConfig`
- **`id`**: The Foundry compendium ID (e.g., `shadowdark.classes`).
- **`type`**: The document type (`Item`, `Actor`, `JournalEntry`, `Scene`, `Macro`, or `RollTable`).
- **`hydrate`**: 
    - `true`: Performs a deep fetch of every document in the pack using the "Index-then-Hydrate" strategy. Use this for character-building data (Classes, Backgrounds) to ensure full descriptions are available.
    - `false`: Performs a lightweight indexed fetch. Ideal for large item or spell libraries where you only need names and basic metadata.
- **`fields`**: (Optional) Specific fields to index when `hydrate` is `false`.

### Sharded Caching
Data is stored at `.data/cache/[systemId]/pack-[id].json`. A `manifest-[systemId].json` tracks MD5 signatures for each shard, ensuring that data is only re-synchronized when it actually changes on the Foundry server.

## 5. Key Rules
1. **No Root Logic**: Do not place logic, adapters, or components in the module root.
2. **Import Hygiene**: The `module/` directory acts as a firewall. Internal `src/` files should use relative paths to other `src/` subdirectories.
3. **Automated Discovery**: New systems are **automatically discovered** on server boot if they follow this manifest structure.
4. **Registry Architecture**: Strictly follow the "Zero `index.ts`" policy for the registry.
   - Server: `@modules/registry/server`
   - Client: `@modules/registry/client`
   - Shared Types: `@modules/registry/types`
