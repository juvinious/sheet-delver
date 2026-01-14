# SheetDelver API Documentation

SheetDelver provides a REST API to interface with a running Foundry VTT instance via `playwright`.

## Core Concept
The API uses a singleton `FoundryClient` (wrapping a headless browser) to automate actions on the Foundry VTT "board". It allows retrieving actor data, updating attributes, rolling dice, and sending chat messages.

## Endpoints

### Actors

#### `GET /api/actors/[id]`
Retrieves normalized data for a specific actor.
- **Params**: `id` (Foundry Actor ID)
- **Response**: JSON object containing actor data (`name`, `img`, `system`, `items`, etc.) with UUIDs resolved to names where possible.

#### `POST /api/actors/[id]/update`
Updates one or more fields on an actor or its embedded items.
- **Params**: `id` (Foundry Actor ID)
- **Body**: JSON object with dot-notation paths.
  - Actor update: `{ "system.attributes.hp.value": 15 }`
  - Item update: `{ "items.ITEM_ID.system.equipped": true }`
- **Response**: `{ "success": true }` or error.

#### `POST /api/actors/[id]/roll`
Triggers a dice roll for a specific ability or item.
- **Params**: `id` (Foundry Actor ID)
- **Body**:
  ```json
  {
    "type": "ability" | "item",
    "key": "STR" | "ITEM_ID",
    "options": { "abilityBonus": 2, "itemBonus": 1 }
  }
  ```
- **Response**: Result object containing `total`, `formula`, and `label`.

### Chat

#### `GET /api/chat`
Retrieves the recent chat log.
- **Query Params**: None (default limit 25).
- **Response**: `{ "messages": [...] }`.
  - Messages include `id`, `user`, `content`, `timestamp`, and roll data (`rollTotal`, `isCritical`, etc.) if applicable.

#### `POST /api/chat/send`
Sends a message to the chat.
- **Body**: `{ "message": "Hello World" }`
- **Response**: `{ "success": true }`.

### System Data

#### `GET /api/system/data`
Retrieves static system data indexed from Compendiums.
- **Response**:
  ```json
  {
    "classes": [...],
    "ancestries": [...],
    "languages": [...],
    "titles": { "Class Name": [...] }
  }
  ```
- **Usage**: Used to resolve class names, localized titles, and language descriptions.
