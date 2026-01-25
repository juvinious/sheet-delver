# API Documentation

SheetDelver acts as a bridge between the Frontend (Next.js) and the Foundry VTT instance (via Playwright). It exposes several RESTful endpoints.

## Core API Routes

These routes handle standard operations like fetching actors, rolling dice, and managing chat.

### Actors

-   **GET** `/api/actors/:id`
    Fetch normalized actor data. Automatically detects the system and uses the appropriate `SystemAdapter`.
-   **DELETE** `/api/actors/:id`
    Delete an actor from Foundry.
-   **POST** `/api/actors/:id/update`
    Update detailed actor data (e.g. `system.hp.value`).
-   **POST** `/api/actors/:id/roll`
    Perform a system-specific roll.
    Body: `{ type: string, key: string, options: any }`
-   **POST** `/api/actors/:id/items`
    Create or Delete items. (Method needs verification, usually DELETE is separate or via query param).
-   **POST** `/api/actors/:id/effects`
    Toggle or manage active effects.

### Chat

-   **GET** `/api/chat`
    Fetch recent chat messages.
-   **POST** `/api/chat/send`
    Send a message to the Foundry chat log.

### Foundry

-   **GET** `/api/foundry/document?uuid=...`
    Fetch a raw document from Foundry by UUID (e.g. an Item from a Compendium).

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
