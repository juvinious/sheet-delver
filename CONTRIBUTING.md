# Contributing to SheetDelver

Welcome to **SheetDelver**! We appreciate your interest in contributing to this extensible character sheet manager.

## Getting Started

### Prerequisites
- Node.js 18+
- A running instance of Foundry VTT (v13+)
- Access to the target Foundry world with a user account.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone git@github.com:juvinious/sheet-delver.git
    cd sheet-delver
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure connection:**
    Create a `settings.yaml` file in the root directory. This file is ignored by git.
    ```yaml
    # settings.yaml
    app:
        host: localhost      # Hostname for the SheetDelver application
        port: 3000           # Port for SheetDelver to listen on
        protocol: http       # Protocol for SheetDelver (http/https)
        chat-history: 100    # Max number of chat messages to retain/display
    
    foundry:
        host: foundryserver.local # Hostname of your Foundry VTT instance
        port: 30000               # Port of your Foundry VTT instance
        protocol: http            # Protocol (http/https)
    
    debug:
        enabled: true        # Run browser in headful mode (visible) for debugging
        level: 4             # Log level (0=None, 1=Error, 2=Warn, 3=Info, 4=Debug)
        # Optional: Auto-login credentials for development
        foundryUser:
            name: gamemaster # Foundry Username
            password: password # Foundry Password
    ```

4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

- `src/lib/foundry`: Core logic for `FoundryClient` (Playwright automation).
- `src/modules`: Vertical slices for each supported system.
  - `core/`: Core interfaces and registry (`SystemAdapter`, `ModuleManifest`).
  - `<system_id>/`: Self-contained system module.
    - `index.ts`: Module manifest export.
    - `info.json`: Metadata.
    - `adapter.ts`: System logic and data implementation.
    - `ui/`: React components for the sheet.
- `src/app/api`: Next.js API routes acting as a bridge between frontend and Foundry.

## Module Architecture & Vertical Slices

To maintain a scalable codebase, we use a **Vertical Slice** architecture for systems.

*   **Everything belongs to a Module**: If you are adding support for a new RPG system (e.g., Pathfinder), *all* code related to that system (Types, Adapter logic, React Components, CSS) must reside in `src/modules/pathfinder/`.
*   **The SystemAdapter Contract**: Each module must implement the `SystemAdapter` interface defined in `src/modules/core/interfaces.ts`. This interface handles:
    *   **Data Fetching**: `getActor(client, id)` (running in browser context via Playwright).
    *   **Normalization**: `normalizeActorData(actor)` (converting raw Foundry data to a UI-friendly shape).
    *   **Rolling**: `getRollData(...)` (handling system-specific dice logic).
    *   **Theming**: `theme` (optional configuration for system-specific colors/fonts).
*   **Isolation**: Do not import code from other system modules. Shared UI components (like `RichTextEditor`, `DiceTray`) are available in `@/components`.
*   **Registry**: Frontend components that need valid server-side rendering or dynamic imports (like Dashboard Tools) are registered in `src/modules/core/component-registry.tsx`.

## Adding a New System

1.  **Create Directory**: Create `src/modules/<system-id>/`.
2.  **Metadata**: Add `info.json`:
    ```json
    { "id": "mysystem", "title": "My RPG System" }
    ```
3.  **Implement Adapter**: Create `adapter.ts` and implement `SystemAdapter`.
4.  **Create Sheet**: Create `ui/MySystemSheet.tsx`.
5.  **Export Manifest**: Create `index.ts`:
    ```typescript
    import React from 'react';
    import { ModuleManifest } from '../core/interfaces';
    import { MySystemAdapter } from './adapter';
    import info from './info.json';

    const manifest: ModuleManifest = {
        info,
        adapter: MySystemAdapter,
        sheet: React.lazy(() => import('./ui/MySystemSheet'))
    };
    export default manifest;
    ```
100:     ```
6.  **Register Module**: Open `src/modules/core/registry.ts`, import your manifest, and add it to the `modules` array.
7.  **Dashboard Tools (Optional)**: If your system has custom dashboard widgets (like a Character Generator), create the component in `ui/MySystemTools.tsx` and register it in `src/modules/core/component-registry.tsx`.

## Development Workflow

1.  **Refactoring Components**: When refactoring, ensure you split large components into smaller files within your module's directory.
2.  **Styling**: Use Tailwind CSS for styling.
3.  **Testing**: Verify your changes against a live Foundry instance running the target system.

## Reusable UI Components

We provide several core components to ensure a consistent UI across different system sheets.

### RichTextEditor
A wrapper around Tiptap for editing HTML content (biographies, notes).
**Path**: `@/components/RichTextEditor`
```tsx
<RichTextEditor 
    content={actor.system.notes} 
    onChange={(html) => onUpdate('system.notes', html)} 
/>
```

### ConfirmationModal
A standard modal for destructive actions. Uses React Portal.
**Path**: `@/components/ui/ConfirmationModal`
```tsx
<ConfirmationModal
    isOpen={isOpen}
    onClose={() => setIsOpen(false)}
    onConfirm={handleDelete}
    title="Delete Item?"
    message="Are you sure you want to delete this content?"
    confirmLabel="Delete"
    isDanger={true}
/>
```

### RollDialog
A unified dialog for configuring dice rolls (Ability checks, Attacks, Spells). Supports generic options or system-specific extensions.
**Path**: `@/components/RollDialog`
```tsx
<RollDialog
    isOpen={isOpen}
    onClose={() => setIsOpen(false)}
    onRoll={(options) => onRoll('attack', 'dager', options)}
    title="Dagger Attack"
    config={{
        modes: ['normal', 'advantage', 'disadvantage'],
        bonuses: ['ability', 'item', 'talent']
    }}
/>
```

### DiceTray
A persistent tray for manual dice rolling. Generally handled by the layout but accessible if needed.
**Path**: `@/components/DiceTray`

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
