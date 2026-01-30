<img src="logo.png" width="25%" alt="SheetDelver Logo">

[![GitHub Repo](https://img.shields.io/badge/github-repo-blue?logo=github)](https://github.com/juvinious/sheet-delver)
[![CI](https://github.com/juvinious/sheet-delver/actions/workflows/ci.yml/badge.svg)](https://github.com/juvinious/sheet-delver/actions/workflows/ci.yml)

A modern, external character sheet interface for [Foundry VTT](https://foundryvtt.com/).

## Current Features
- **Shadowdark RPG Support**: Full support for Shadowdark character sheets with a clean, modern UI.
- **Auto-Calculations**: Automatic calculation of Stats, HP, AC, and Inventory flexibility.
- **Inventory Management**: Drag-and-drop equipment, slot tracking, and toggleable states (Equipped/Stashed/Light).
- **Interactive Toggles**: Custom icons for managing item states directly from the inventory list.
- **Formatted Chat**: Rich chat messages for rolls and abilities with inline roll buttons.
- **Character Import**: Import characters via JSON from Shadowdarklings (including Gear, Spells, and Magic Items).
- **System Agnostic UI**: Core components adapt to system themes via configuration.
- **Mobile Friendly**: optimized touch targets and layout.

## Supported Systems
- **Shadowdark RPG**: Complete support (Stats, Inventory, Spells, Talents, Effects).
- **Mörk Borg**: Initial skeleton support (HP, Omens, Abilities).
- **D&D 5e**: Basic adapter support (Stats, Skills).
- **Generic**: Fallback support for any Foundry system (Raw data view).

## Architecture
SheetDelver uses a multi-system architecture based on specific modules:
1.  **System Modules** (`src/modules/<system>/`): Self-contained vertical slices containing proper logic and UI.
2.  **Core Registry** (`src/modules/core/registry.ts`): Dynamically loads system modules.
3.  **Sheet Router** (`src/components/SheetRouter.tsx`): Renders the correct UI based on the actor's system.
4.  **Foundry Adapter**: Decouples backend logic, ensuring valid data flow regardless of the system.

Each module follows a consistent structure:
```
src/modules/<system>/
├── index.ts           # Manifest
├── info.json          # Metadata
├── system.ts          # Data Migration & Adapter Logic
├── rules.ts           # Core System Rules
├── importer.ts        # Character Importers (Optional)
├── server.ts          # Server-Side API Handlers (Optional)
└── ui/                # React Components
```

5.  **Module API** (`api/modules/[systemId]/...`): Automatically routes requests to the module's `server.ts` handlers, allowing system-specific backend logic (e.g. importers).

For details on adding a new system, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Future Roadmap
- **Component Library**: Generic "Base Sheet" components for rapid system development.
- **Modules Integration**: Better integration with core Foundry modules.
- **Character Creation**: Native Foundry character creation support, utilizing system macros where available.

## Usage

### Requirements
- **Node.js**: 18+
- **Foundry VTT**: Valid instance (v13+ required)

### Configuration
Create a `settings.yaml` file in the root directory to configure the connection to your Foundry instance.

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

### Running Locally
To run the application locally for personal use:

1.  Current directory:
    ```bash
    npm install
    npx playwright install --with-deps
    npm run build
    npm start
    ```
2.  Open [http://localhost:3000](http://localhost:3000).

### Deployment
To deploy on a dedicated server:

1.  Clone the repository.
2.  Install dependencies: `npm install`
3.  Install browser binaries: `npx playwright install --with-deps`
4.  Build the application: `npm run build`
5.  Start the server: `npm start`
    - *Note: You may want to use a process manager like PM2 to keep it running.*

## Development
For developers interested in contributing to **SheetDelver**, please refer to [CONTRIBUTING.md](CONTRIBUTING.md) for detailed setup instructions, architecture overview, and guidelines.

## License

This project is licensed under the MIT License.

### Third-Party Licenses

**Shadowdark RPG**
This product is an independent product published under the Shadowdark RPG Third-Party License and is not affiliated with The Arcane Library, LLC. Shadowdark RPG © 2023 The Arcane Library, LLC.

**foundryvtt-shadowdark**
Partial code and data utilized from the [foundryvtt-shadowdark](https://github.com/Muttley/foundryvtt-shadowdark) system, licensed under the MIT License. Copyright (c) 2023 Paul Maskelyne.
