# API Documentation

SheetDelver acts as a bridge between the Frontend (Next.js) and the Foundry VTT instance (via direct Sockets). It operates in a truly headless mode, removing the need for a browser or Playwright.

## Core API Routes

These routes handle standard operations like fetching actors, rolling dice, and managing chat.

### Actors

-   **GET** `/api/actors`
    List all accessible actors. **Requires Authentication.**
-   **GET** `/api/actors/:id`
    Fetch normalized actor data. Automatically detects the system and uses the appropriate `SystemAdapter`. **Requires Authentication.**
-   **DELETE** `/api/actors/:id`
    Delete an actor from Foundry.
-   **POST** `/api/actors/:id/update`
    Update detailed actor data (e.g. `system.hp.value`).
-   **POST** `/api/actors/:id/roll`
    Perform a system-specific roll.
    Body: `{ type: string, key: string, options: any }`
-   **POST** `/api/actors/:id/items`
    Create a new item on the actor.
    Body: `{ item: object }`
-   **PUT** `/api/actors/:id/items`
    Update an existing item on the actor.
    Body: `{ itemId: string, updateData: object }`
-   **DELETE** `/api/actors/:id/items`
    Delete an item from the actor.
    Query: `?itemId=...`
-   **POST** `/api/actors/:id/effects`
    Toggle or manage active effects.
-   **GET** `/api/actors/:id/predefined-effects`
    Fetch system-specific predefined effects (e.g. conditions) available for this actor.

### Chat

-   **GET** `/api/chat`
    Fetch recent chat messages.
-   **POST** `/api/chat/send`
    Send a message to the Foundry chat log.

### Session & Users

-   **GET** `/api/session/connect`
    Check connection status with Foundry.
-   **POST** `/api/session/login`
    Authenticate with Foundry using GM/Assistant credentials from `settings.yaml`.
-   **POST** `/api/session/logout`
    Terminate the current session.
-   **GET** `/api/users`
    Fetch list of available Foundry users. **Requires Authentication.**

### System

-   **GET** `/api/system`
    Get system-wide configuration or status. **Requires Authentication.**
-   **GET** `/api/system/data`
    Get detailed system data (e.g. compendiums, world settings). **Requires Authentication.**

### Foundry

-   **GET** `/api/foundry/document?uuid=...`
    Fetch a raw document from Foundry by UUID (e.g. an Item from a Compendium). **Requires Authentication.**

### Shadowdark (System Specific)

Base Path: `/api/modules/shadowdark`

-   **GET** `/index`
    Fetch the server-side compendium index manifest. Used for UUID resolution. **Requires Authentication.**
-   **POST** `/import`
    Import a character from JSON data (Shadowdarklings output).
-   **GET** `/actors/:id/level-up/data`
    Fetch formatted data required for the level-up modal.
-   **POST** `/actors/:id/level-up/roll-hp`
    Roll HP for the current class/level.
-   **POST** `/actors/:id/level-up/roll-gold`
    Roll starting gold for a level 1 character.
-   **POST** `/actors/:id/level-up/finalize`
    Apply level-up changes (HP, talents, stats) to the actor.
-   **POST** `/actors/:id/spells/learn`
    Learn a spell by UUID.
-   **GET** `/spells/list?source=:className`
    Fetch a list of spells available for a specific class (e.g. "Wizard").

## Module API Architecture

Ref: [CONTRIBUTING.md](../CONTRIBUTING.md)

Modules can define their own server-side API handlers to extend functionality without modifying the core.

### Route Structure
`/api/modules/:systemId/:route*`

### Implementation
To add an API route to your system module (e.g., `mysystem`):

1.  Create `src/modules/mysystem/server.ts`.
2.  Export an `apiRoutes` object mapping route names to handlers.

```typescript
// src/modules/mysystem/server.ts
import { NextResponse } from 'next/server';

export const apiRoutes = {
    'import-character': async (req: Request) => {
        const body = await req.json();
        // logic...
        return NextResponse.json({ success: true });
    }
};
```

3.  Register in `src/modules/core/server-modules.ts`.
4.  Call it via `fetch('/api/modules/mysystem/import-character', ...)`.
