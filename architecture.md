# SheetDelver System Architecture

This document serves as the authoritative source of truth for the SheetDelver architecture. It describes the design principles, structural organization, and future decoupling strategy.

## 1. Architectural Philosophy
SheetDelver is designed as a **Headless Client** for Foundry VTT. It aims to provide a rich, system-specific interface that operates independently of a standard web browser, interacting directly with Foundry's Socket.io and HTTP layers.

### Core Principles
- **Separation of Concerns**: Business logic (Foundry interaction) is isolated from the UI (React).
- **Extensibility**: A pluggable Module System allows support for multiple RPG systems (Shadowdark, DnD 5e, Mork Borg).
- **Resilience**: The system must handle transient network issues, world restarts, and authentication states gracefully.

---

## 2. Decoupled Architecture (The Target State)
To resolve state management conflicts in Next.js, the system is transitioning to a decoupled "Core/Shell" model.

### 2.1 The Core Service (Backend)
- **Primary Role**: Owns the persistent connection to Foundry VTT and acts as a security boundary. It runs as a silent daemon in production.
- **Technology**: Standalone Node.js process (Express API).
- **Responsibilities**:
    - Manage the `SocketFoundryClient` singleton.
    - **Admin API (Local-Only)**: Exposes a protected interface bound to `127.0.0.1` for administrative actions.
    - **Internal Metadata Discovery**: Performs world/system scraping via `SetupScraper` on the backend.
    - **Data Sanitization**: Exposes only safe, filtered metadata to the public-facing App API.
    - Maintain continuous heartbeat/socket connection to Foundry.
    - Cache supplementary data (Compendiums, System Items).
    - Handle User Authentication and Session validation.

### 2.2 The Shell (Frontend)
- **Primary Role**: High-fidelity User Interface and Presentation.
- **Technology**: Next.js (React).
- **Responsibilities**:
    - Render system-specific character sheets and tools.
    - Provide a smooth, state-driven navigation experience.
    - Proxy API requests to the Core Service via internal `/api` routes.
    - Manage local UI state (modals, tabs, local filters).

---

## 3. Module System Design
Extensibility is achieved through **System Modules** located in `src/modules`.

### 3.1 Module Structure
Each module (e.g., `shadowdark`) follows a standardized structure:
- `index.ts`: The **Application Manifest**. Defines the system ID and links the Adapter to the UI.
- `system.ts`: The **System Adapter**. Contains logic for data normalization and system-specific rules.
- `ui/`: Contains React components for sheets and tools.
- `server/`: (Optional) Contains backend-specific logic or API route extensions.

### 3.2 The System Adapter (`SystemAdapter`)
The Adapter is the translation layer between Foundry's raw JSON and SheetDelver's UI-ready structures.
- **Normalization**: Maps diverse system data models into a consistent `ActorSheetData` format.
- **Rule Engine**: Implements system-specific logic (roll calculations, inventory slot management, level-up automation).
- **Foundry Interface**: Uses `client.evaluate()` to execute code in the Foundry context if necessary.

---

## 4. Key Components

### 4.1 `SocketClient.ts`
The core engine for Foundry interaction.
- **Connection Logic**: Handles the complex Foundry v13 handshake, cookie parsing, and socket.io maintenance.
- **State Machine**: Tracks `worldState` (`offline`, `setup`, `active`) and `sessionState` (`loggedIn`, `guest`).
- **Data Fetching**: Executes `modifyDocument` socket requests to retrieve and update actors/items.

### 4.2 `SetupScraper.ts`
A specialized HTTP utility used to interact with the Foundry Setup page. It discovers available worlds and triggers launches. Full system scraping (items, etc.) occurs once a world is running.

### 4.3 `CompendiumCache.ts`
Manages server-side caching of Foundry Compendium data to ensure fast lookups of items and rules without overwhelming the socket.

### 4.4 `Admin CLI Utility`
A standalone interactive terminal tool that connects to the Core Service's **Admin API** (via localhost). It allows the administrator to:
- Scrape and list all discoverable worlds on the Foundry server.
- **World Management**: Interactively start or shut down specific worlds.
- **Data Scrape Control**: Trigger or refresh deep-scrapes of running worlds manually.
- **Security**: Ensures administrative control is only available to local users on the server.

---

## 5. Path Reference (Source of Truth)

| Path | Purpose |
| :--- | :--- |
| `src/lib/foundry` | Core Foundry connection and protocol logic. |
| `src/modules` | Pluggable RPG system implementations. |
| `src/modules/core` | System-agnostic registries and interfaces. |
| `src/app/api` | API entry points (to be converted to proxies). |
| `src/components` | Shared UI components. |
| `src/server` | (Proposed) Entry point for the Core Service. |

---

## 6. Communication Flow
1. **Frontend Boot**: `ClientPage.tsx` polls `/api/session/connect`.
2. **System Check**: The Core Service verifies the Foundry connection status via `SocketClient`.
3. **State Delivery**: Core returns a unified status (Setup, Connected, or LoggedIn).
4. **Action Capture**: User takes action (e.g., updates HP).
5. **Request Flow**: UI -> API Proxy -> Core Service -> `SocketClient` -> Foundry Socket -> DB update.
6. **Confirmation**: Socket event broadcasted -> `SocketClient` updates state -> Poll returns new state to UI.
