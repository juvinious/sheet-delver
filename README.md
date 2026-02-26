<img src="logo.png" width="25%" alt="SheetDelver Logo">

[![GitHub Repo](https://img.shields.io/badge/github-repo-blue?logo=github)](https://github.com/juvinious/sheet-delver)
[![CI](https://github.com/juvinious/sheet-delver/actions/workflows/ci.yml/badge.svg)](https://github.com/juvinious/sheet-delver/actions/workflows/ci.yml)

A modern, external character sheet interface for [Foundry VTT](https://foundryvtt.com/).

## Key Features
- **Real-Time Interactions**: Instant display of images and journals shared by the GM ("Show to Players"), with support for both broadcast and targeted sharing.
- **Rich Journal Browser**: Advanced journal viewing with folder support, rich text rendering, and pagination.
- **Global Chat**: Integrated chat with roll parsing, dice support, and actor-specific roll buttons.
- **Floating HUD**: Centralized access to character sheets, journals, and global settings.
- **User Monitoring**: Real-time list of active players with connection status and avatar resolution.
- **Resilient Connection**: Dual-layered socket system (System/User) with high-stability auto-reconnection.
- **Mobile Friendly**: Optimized touch targets and responsive layouts.

## Supported Systems

### Shadowdark RPG
While not yet feature-complete, SheetDelver offers robust support for Shadowdark:
- **Character Sheets**: Full support for Shadowdark character sheets with a clean, modern UI.
- **Auto-Calculations**: Automatic calculation of Stats, HP, AC, and Inventory flexibility.
- **Inventory Management**: Drag-and-drop equipment, slot tracking, and toggleable states (Equipped/Stashed/Light).
- **Treasure & Wealth**: Dedicated section for treasure items with total wealth tracking and "Sell" functionality.
- **Gear Selection**: Integrated compendium browser for quickly adding standard gear, armor, and weapons.
- **Interactive Toggles**: Custom icons for managing item states directly from the inventory list.
- **Formatted Chat**: Rich chat messages for rolls and abilities with inline roll buttons.
- **Character Import**: Import characters via JSON from Shadowdarklings.
- **Level Up Wizard**: Guided level-up process with talent/boon rolling and choice resolution.

### Mörk Borg
SheetDelver provides dedicated support for the Mörk Borg RPG system:
- **Character Sheets**: Full character sheet with the signature Mörk Borg aesthetic — yellow, black, and pink brutalist design.
- **Ability Rolls**: Click any ability (STR/AGI/PRE/TOU) to open a roll confirmation modal showing the resolved formula before dispatching.
- **Roll Modal**: Generic confirmation dialog for all rollable actions — shows formula, optional DR, and roll mode selector (Public/GM Only/Blind/Self), persisted to localStorage.
- **Feats & Scrolls**: Formula feats roll via the modal with resolved `@ability` values; macro feats (e.g. Brew Decoctions) trigger immediately; passive feats display only.
- **Violence Tab**: Equipped weapons and armor only — with Attack/Defend roll buttons using the full automated sequence.
- **Custom Chat Cards**: Styled Mörk Borg chat cards for all roll outcomes (ability tests, feat rolls, attacks, defense, initiative, broken, get better, decoctions).
- **Get Better**: Automated sequence rolling HP, all four abilities, and debris — including auto-creating found scrolls in the actor's inventory.
- **Equipment Management**: Full inventory with quantity controls, equip/carry toggles, and an **Organize Inventory** button that merges duplicate items.
- **Rest System**: Rest modal with food/drink condition tracking, infection handling, and HP recovery rolls.
- **Spend Omen**: Omen spending with outcome reminder card.
- **Broken & Initiative**: Broken condition rolls and individual/party initiative.

## Planned System Support
- **Generic**: Fallback support for any Foundry system (Raw data view).
- **D&D 5e**: Basic adapter support (Stats, Skills).

## Architecture
SheetDelver follows a **Decoupled Core/Shell** architecture with a centralized **Context Driven State**:
1.  **Core Service** (`src/core`, `src/server`): A standalone Express API server that manages multiple persistent socket connections to Foundry VTT.
2.  **Frontend Shell** (`src/app`): A Next.js application. State is managed via React Context (`FoundryContext`, `JournalProvider`, `UIContext`), providing a reactive experience across all components.
3.  **Shared Layer** (`src/shared`): Common TypeScript interfaces and constants used by both Core and Shell.
4.  **System Modules** (`src/modules`): Pluggable RPG system logic (Adapters and UI).
5.  **Admin CLI** (`src/cli`): Command-line tool for world management and setup.

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

security:
    rate-limit:
        enabled: true           # Enable/disable login rate limiting
        window-minutes: 15      # Time window in minutes
        max-attempts: 5         # Maximum login attempts per window
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

**Mörk Borg RPG**
Mörk Borg is copyright Ockult Örtmästare Games and Stockholm Kartell. This product is an independent production by SheetDelver and is not affiliated with Ockult Örtmästare Games or Stockholm Kartell. It is published under the [MÖRK BORG THIRD PARTY LICENSE](https://morkborg.com/license/).

**foundryvtt-morkborg**
Partial code and data reference utilized from the [foundryvtt-morkborg](https://github.com/fvtt-fria-ligan/morkborg-foundry) system, licensed under the MIT License. Copyright (c) fvtt-fria-ligan contributors.
