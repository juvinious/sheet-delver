<img src="logo.png" width="25%" alt="SheetDelver Logo">

[![GitHub Repo](https://img.shields.io/badge/github-repo-blue?logo=github)](https://github.com/juvinious/sheet-delver)
[![CI](https://github.com/juvinious/sheet-delver/actions/workflows/ci.yml/badge.svg)](https://github.com/juvinious/sheet-delver/actions/workflows/ci.yml)

A modern, external character sheet interface for [Foundry VTT](https://foundryvtt.com/).

## Supported Systems

### Shadowdark RPG
While not yet feature-complete, SheetDelver offers robust support for Shadowdark:
- **Character Sheets**: Full support for Shadowdark character sheets with a clean, modern UI.
- **Auto-Calculations**: Automatic calculation of Stats, HP, AC, and Inventory flexibility.
- **Inventory Management**: Drag-and-drop equipment, slot tracking, and toggleable states (Equipped/Stashed/Light).
- **Interactive Toggles**: Custom icons for managing item states directly from the inventory list.
- **Formatted Chat**: Rich chat messages for rolls and abilities with inline roll buttons.
- **Character Import**: Import characters via JSON from Shadowdarklings.
- **Mobile Friendly**: Optimized touch targets and layout.
- **Resilient Connection**: High-stability socket client with auto-reconnection and a dedicated "Reconnecting" overlay for non-disruptive UX.

## Planned System Support
- **Mörk Borg**: Initial skeleton support (HP, Omens, Abilities).
- **D&D 5e**: Basic adapter support (Stats, Skills).
- **Generic**: Fallback support for any Foundry system (Raw data view).

## Architecture
SheetDelver follows a **Decoupled Core/Shell** architecture:
1.  **Core Service** (`src/core`, `src/server`): A standalone backend that maintains the persistent socket connection to Foundry VTT.
2.  **Frontend Shell** (`src/app`): A Next.js application that provides the user interface and proxies requests to the Core Service via `coreFetch`.
3.  **Shared Layer** (`src/shared`): Common TypeScript interfaces and constants used by both Core and Shell.
4.  **System Modules** (`src/modules`): Pluggable RPG system logic (Adapters and UI).

---

## Usage

### Requirements
- **Node.js**: 18+
- **Foundry VTT**: Valid instance (v13+ recommended)

### Configuration
Create a `settings.yaml` file in the root directory to configure the connection to your Foundry instance.

### Running Locally
To run the application locally:
1.  Install dependencies: `npm install`
2.  Launch both Core and Shell: `npm run dev` (for development) or `npm run build && npm start` (for production).
3.  Open [http://localhost:3000](http://localhost:3000).

*Note: The startup process automatically manages both the backend service and the frontend web server.*

## Development
For developers interested in contributing to **SheetDelver**, please refer to [CONTRIBUTING.md](CONTRIBUTING.md) for detailed setup instructions, architecture overview, and guidelines.

## License

This project is licensed under the MIT License.

### Third-Party Licenses

**Shadowdark RPG**
This product is an independent product published under the Shadowdark RPG Third-Party License and is not affiliated with The Arcane Library, LLC. Shadowdark RPG © 2023 The Arcane Library, LLC.

**foundryvtt-shadowdark**
Partial code and data utilized from the [foundryvtt-shadowdark](https://github.com/Muttley/foundryvtt-shadowdark) system, licensed under the MIT License. Copyright (c) 2023 Paul Maskelyne.
