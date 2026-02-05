# API Documentation

The Sheet Delver API provides access to Foundry VTT data through a headless session wrapper.

## Authentication
All protected routes require a `Bearer` token in the `Authorization` header.
Tokens are obtained via `/api/login`.

## Session & Status

### `GET /api/status`
**Auth**: Public (Limited) / Protected
Returns the current connection status of the headless client and the Foundry world.
Also used for polling via `/api/session/connect`.

**Response:**
```json
{
  "connected": true,
  "isAuthenticated": true,
  "initialized": true,
  "users": [
    {
      "name": "Gamemaster",
      "role": 4,
      "isGM": true,
      "active": true,
      "img": "..."
    }
  ],
  "system": {
    "id": "shadowdark",
    "status": "active"
  }
}
```

### `GET /api/session/users`
**Auth**: Protected
Returns a list of all users in the world, with sanitized URLs and role flags.

**Response:**
```json
{
  "users": [ ... ]
}
```

### `POST /api/login`
**Body**: `{ "username": "...", "password": "..." }`
**Response**: `{ "success": true, "token": "uuid", "userId": "uuid" }`

### `POST /api/logout`
**Auth**: Protected
Destroys the current session.

## Foundry System Data

### `GET /api/system`
Returns basic system information (id, version, world title).

### `GET /api/system/data`
Returns full system-specific data (ancestries, classes, roll tables) scraped or adapted from the world.

## Actors & Items

### `GET /api/actors`
Returns a list of actors visible to the current user (Owned + Observed).

### `GET /api/actors/:id`
Returns detailed data for a specific actor.

### `PATCH /api/actors/:id`
Updates actor data.
**Body**: `{ "system.abilities.str.value": 14 }` (Dot notation supported)

### `POST /api/actors/:id/roll`
Executes a roll for an actor.
**Body**: `{ "type": "ability", "key": "str" }` or `{ "type": "item", "key": "itemId" }`

### `POST /api/actors/:id/items`
Creates a new item on the actor.

### `DELETE /api/actors/:id/items?itemId=...`
Deletes an item from the actor.

## Chat & Journal

### `GET /api/chat`
Returns recent chat messages.

### `POST /api/chat/send`
Sends a message or roll command to chat.

### `GET /api/journals`
Returns visible journal entries.

### `GET /api/foundry/document?uuid=...`
Fetches a specific document by UUID.
