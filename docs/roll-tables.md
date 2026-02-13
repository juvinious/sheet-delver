# Roll Table System

## Overview
The Roll Table system in SheetDelver provides a robust, system-agnostic way to roll on Foundry VTT tables via the headless socket client. It addresses specific issues with data integrity (stale result IDs) found in some system exports (like Shadowdark) by using an **Adapter Pattern**.

## Usage

### Core Socket
The `CoreSocket` class exposes a `draw` method that should be used for all table operations. It aligns with Foundry VTT's native `RollTable.draw()` behavior.

```typescript
const result = await client.draw(tableUuid, options);
```

#### Parameters
- `tableUuid` (string): The UUID of the table to roll on.
- `options` (object, optional):
  - `roll` (Roll): A pre-evaluated Roll instance to use instead of rolling randomly.
  - `displayChat` (boolean): Whether to send the result to Foundry's chat. Default `true`.
  - `rollMode` (string): The roll mode ('publicroll', 'gmroll', 'blindroll', 'selfroll').
  - `actorId` (string): Actor ID to use as the speaker for the roll and chat message.
  - `userId` (string): User ID to perform the roll as.

#### Native Implementation Features
- **Server-Side Evaluation**: Rolling is performed via `CoreSocket.roll` using server-side evaluation.
- **Drawn Status**: If the table is not in a Compendium and `replacement` is false, matched results are marked as `drawn: true` in Foundry.
- **Hydration**: Result documents (Items, Spells, etc.) are automatically hydrated with their full data.
- **Speaker Attribution**: Rolls and chat messages are attributed to the player's actor/username.

#### Return Value
Returns a promise resolving to:
```typescript
{
    roll: any,            // The Roll result (JSON)
    total: number,        // The total value of the roll
    results: any[]        // Array of hydrated TableResult objects
}
```

#### Backward Compatibility
The old `rollTable` method is maintained as an alias for `draw` for backward compatibility.

## Architecture

### The Problem: Stale Data
In some Foundry systems (e.g., Shadowdark), the `RollTable` documents returned by the server API via socket may contain "stale" `results` arrays. specifically, `table.results` might be an array of IDs that correspond to **old** versions of the results, or results that don't exist in the server's ephemeral database index, even though they exist on disk.

When this happens, standard fetching (`client.fetchByUuid` or `table.getEmbeddedDocument`) fails, returning `null` or throwing errors.

### The Solution: Adapter Pattern
`CoreSocket` detects when standard result expansion fails (i.e., we have IDs but can't fetch the objects). It then delegates to the registered **System Adapter**.

#### System Adapter Interface
Adapters implement `expandTableResults(tableId: string): Promise<any[]>`.

#### Shadowdark Adapter Implementation
The `ShadowdarkAdapter` uses the `DataManager` to look up the result data directly from the local file system cache (`!tables.results!`). This bypasses the broken server index and ensures we always get the valid result data as defined in the system's source files.

## API Endpoint
The backend API endpoint `/api/foundry/roll-table` wraps this logic, providing a simple REST interface for the frontend.

`POST /api/foundry/roll-table`
```json
{
  "tableUuid": "Compendium.shadowdark.rollable-tables.ID",
  "options": {
    "displayChat": true,
    "rollMode": "self" // Optional. Defaults to 'self'.
  }
}
```
