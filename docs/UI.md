# UI Documentation

SheetDelver's UI is built with **Next.js**, **React**, and **Tailwind CSS**, following a "Foundry-Modern" aesthetic: dark, high-contrast, with cinematic typography (Cinzel/Inter) and rich glassmorphism.

## Core Interaction Model

The UI is driven by a hierarchy of React Contexts that synchronize state with the Backend API:
- **`FoundryContext`**: Manages authentication, world status real-time WebSocket synchronization, and actor updates via Socket.io. It implements a robust state machine (`init`, `setup`, `login`, `authenticating`, `dashboard`) to ensure smooth transitions.
- **`JournalProvider`**: Manages journal entry loading, folder hierarchies, pagination (v13 standard), and GM-shared content.
- **`UIContext`**: Controls global visibility of sidebars, modals, and the Floating HUD.

---

## Key Components

### 1. Floating HUD (`src/app/ui/components/FloatingHUD.tsx`)
A permanent, stylish navigation bar anchored to the bottom of the screen. It provides quick access to:
- **Character Select**: Switch between owned and observable actors.
- **Journal Browser**: Browse world journals and folders.
- **Global Chat**: Access integrated chat and dice rolls.
- **User List**: Monitor active players and GM presence.

### 2. Journal Browser & Modal
- **JournalBrowser**: A folder-aware explorer for all visible journals.
- **JournalModal**: A high-fidelity viewer supporting rich text rendering, multi-page navigation, and editor modes for owners.

### 3. Global Chat (`src/app/ui/components/GlobalChat.tsx`)
- **Integrated DiceTray**: Visual interface for common dice rolls.
- **Roll Parsing**: Automatically detects and executes `/roll` commands.
- **Actor Attribution**: Automatically attaches the current user's selected actor as the "speaker".

### 4. Combat HUD (`src/app/ui/components/Combat/CombatHUD.tsx`)
A dedicated, real-time overlay for active encounters:
- **Turn Tracking**: Displays the current initiative order, highlighting the active combatant and round number.
- **Automated Appearance**: Automatically mounts and unmounts based on the Foundry world's combat state.
- **Universal Initiative**: Integrates with the `InitiativeModal` abstraction to provide a unified rolling experience across different RPG systems (handling advantage, distinct formulas, etc.).

### 5. Shadowdark Sheet (`src/modules/shadowdark/ui/ShadowdarkSheet.tsx`)
Specialized interface for the Shadowdark RPG, featuring:
- **Tabbed Navigation**: Abilities, Inventory, Spells, Talents, and Effects.
- **Real-Time Persistence**: Changes to stats or configuration are instantly synced to Foundry.
- **Level Up Wizard**: Guided UI for character progression.

---

## Technical Patterns

### 1. Notification System
A robust toast system supporting HTML content for dice results.
- **Usage**: `const { addNotification } = useNotifications();`

### 2. Loading & Reconnecting
The UI includes full-screen overlays for:
- **Initial Load**: Shows while the backend warms its compendium cache.
- **Auto-Reconnection**: Appears non-disruptively if the socket connection is lost.

### 3. Aesthetic Guidelines
- **Typography**: `Cinzel` for cinematic headings; `Inter` for functional body text.
- **Color Palette**: `Zinc-900` backgrounds with `Amber-500` (Gold) interactive accents.
- **Glassmorphism**: Extensive use of backdrop-blur (`backdrop-blur-md`) and semi-transparent layers.
