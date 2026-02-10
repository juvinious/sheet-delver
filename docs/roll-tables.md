# Roll Table System

## Overview
The Roll Table system in SheetDelver provides a robust, system-agnostic way to roll on Foundry VTT tables via the headless socket client. It addresses specific issues with data integrity (stale result IDs) found in some system exports (like Shadowdark) by using an **Adapter Pattern**.

## Usage

### Core Socket
The `CoreSocket` class exposes a `rollTable` method that should be used for all table operations.

```typescript
const result = await client.rollTable(tableUuid, options);
```

#### Parameters
- `tableUuid` (string): The UUID of the table to roll on. Supports both standard format (`Compendium.scope.pack.ID`) and verbose format (`Compendium.scope.pack.RollTable.ID`).
- `options` (object, optional):
  - `roll` (Roll): A pre-evaluated Roll instance to use instead of rolling randomly.
  - `displayChat` (boolean): Whether to send the result to Foundry's chat. Default `false`.
  - `rollMode` (string): The roll mode ('public', 'private', 'blind', 'self', 'gm'). Default 'public'.
  - `chatMessageData` (object): Additional data for the chat message.

#### Return Value
Returns a promise resolving to:
```typescript
{
    roll: Roll,           // The Foundry Roll instance
    total: number,        // The total value of the roll
    results: TableResult[], // Array of matching TableResult objects
    table: RollTable      // The table document
}
```

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
