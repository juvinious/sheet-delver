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
    host: localhost
    port: 30000
    protocol: http
    # Actual Foundry instance
    foundry:
        host: http://foundryserver.local
        port: 80
        protocol: http
    config:
        debug:
            # Enable or disable debug logging
            debug: true # runs browser in headful mode for debugging
            # 0 = None, 1 = Error, 2 = Warning, 3 = Info, 4 = Debug
            level: 4
            # Replace with user that is game master or assistant game master in Foundry
            foundryUser:
                name: foundrygm
                password: foundry
        chat-history: 100 # How much of the chat history to show in the application
    ```

4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

- `src/lib/foundry`: Core logic for `FoundryClient` (Playwright automation).
- `src/components/sheets`: Character sheet components.
  - `shadowdark/`: Modules for the Shadowdark RPG sheet (Inventory, Spells, etc.).
- `src/app/api`: Next.js API routes acting as a bridge between frontend and Foundry.

## Development Workflow

1.  **Refactoring Components**: When refactoring, ensure you split large components into smaller files in `src/components/sheets/[system]/`.
2.  **Styling**: Use Tailwind CSS for styling.
3.  **Testing**: Currently, manual verification is required. Check the sheet against a live Foundry instance to ensure data syncs correctly.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
