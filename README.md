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
1.  **Core Service** (`src/core`, `src/server`): A standalone Express API server that maintains the persistent socket connection to Foundry VTT and exposes REST endpoints.
2.  **Frontend Shell** (`src/app`): A Next.js application that provides the user interface. API requests are forwarded to the Core Service via Next.js rewrite rules.
3.  **Shared Layer** (`src/shared`): Common TypeScript interfaces and constants used by both Core and Shell.
4.  **System Modules** (`src/modules`): Pluggable RPG system logic (Adapters and UI).
5.  **Admin CLI** (`src/cli`): Command-line tool for world management and administrative tasks.

---

## Usage

### Requirements
- **Node.js**: 18+
- **Foundry VTT**: Valid instance (v13+ recommended)

### Configuration
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
    connector: socket         # 'socket' (Headless Sockets)
    username: "gamemaster"    # Required for Headless connection
    password: "password"      # Required for Headless connection
    # Optional: Path to Foundry Data directory for direct world import
    # foundryDataDirectory: "/path/to/foundryuserdata"

debug:
    enabled: true        # Enable debug logging
    level: 3             # Log level (0=None, 1=Error, 2=Warn, 3=Info, 4=Debug)
```

### Running Locally
1.  **Install Dependencies**:
    ```bash
    npm install
    ```
2.  **Run Setup Wizard**:
    ```bash
    npm run setup
    ```
    *Follow the prompts to configure your Foundry connection.*

3.  **Start the Application**:
    -   **Development**:
        ```bash
        npm run dev
        ```
    -   **Production**:
        ```bash
        npm run build && npm start
        ```

4.  **Deployment (PM2)**:
    For production environments, use [PM2](https://pm2.keymetrics.io/) with the provided ecosystem file to ensure the application runs from the correct directory.

    ```bash
    # Install PM2 globally
    npm install -g pm2

    # Start the application using the ecosystem config
    pm2 start ecosystem.config.cjs

    # (Optional) Enable startup on boot
    pm2 startup
    pm2 save
    ```

5.  **Open**: Navigate to the URL shown in the setup output (typically [http://localhost:3000](http://localhost:3000)).

*Note: The startup process automatically manages both the backend service and the frontend web server.*

### Admin CLI
SheetDelver includes a command-line interface for managing the Core Service and world data.

- **Interactive Menu**: `npm run admin`
  - `i` - Import Worlds (from disk)
  - `s` - Start World (if already imported/cached)
  - `c` - Configure/Setup (Manual Cookie)

- **Direct Import**: `npm run admin import <path>`
  - **Smart Discovery**:
    - If `<path>` is a **Data Directory** (e.g. `FoundryVTT/Data`), it imports **ALL** worlds found within.
    - If `<path>` is a **World Directory** (e.g. `FoundryVTT/Data/worlds/my-world`), it imports **only that world**.
  - *Example*: `npm run admin import /home/user/.local/share/FoundryVTT/Data`

## Development
For developers interested in contributing to **SheetDelver**, please refer to [CONTRIBUTING.md](CONTRIBUTING.md) for detailed setup instructions, architecture overview, and guidelines.

## License

This project is licensed under the MIT License.

### Third-Party Licenses

**Shadowdark RPG**
This product is an independent product published under the Shadowdark RPG Third-Party License and is not affiliated with The Arcane Library, LLC. Shadowdark RPG © 2023 The Arcane Library, LLC.

**foundryvtt-shadowdark**
Partial code and data utilized from the [foundryvtt-shadowdark](https://github.com/Muttley/foundryvtt-shadowdark) system, licensed under the MIT License. Copyright (c) 2023 Paul Maskelyne.
