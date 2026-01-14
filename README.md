# SheetDelver

**SheetDelver** is an extensible character sheet manager designed to interface with **Foundry Virtual Tabletop**© for local or in-person play, mainly focused on end-users who do not have a laptop/computer and need access to their character sheet. It focuses on usability, aesthetics, and future multi-system support.

## Current Features
- **Shadowdark RPG Support**: Full support for Shadowdark character sheets with a clean, modern UI.
- **Auto-Calculations**: Automatic calculation of Stats, HP, AC, and Inventory flexibility.
- **Inventory Management**: Drag-and-drop equipment, slot tracking, and toggleable states (Equipped/Stashed/Light).
- **Interactive Toggles**: Custom icons for managing item states directly from the inventory list.
- **Formatted Chat**: Rich chat messages for rolls and abilities with inline roll buttons.
- **Mobile Friendly**: optimized touch targets and layout.

## Future Roadmap
- **System Extensibility**: Plugin architecture to easily add support for 5e, Pathfinder, and other systems.
- **Character Builder**: 'CharacterForge' style builder for creating new characters step-by-step.
- **Module Integration**: Better integration with core Foundry modules.

## Usage

### Requirements
- **Node.js**: 18+
- **Foundry VTT**: Valid instance (v13+ required)

### Configuration
Create a `settings.yaml` file in the root directory to configure the connection to your Foundry instance.

```yaml
# Application settings
host: localhost       # The hostname this application will bind to
port: 3000            # The port this application will run on
protocol: http        # The protocol (http/https)

# Foundry VTT Connection
foundry:
    host: http://your-foundry-server.local # The hostname of your Foundry instance
    port: 30000                            # The port of your Foundry instance
    protocol: http                         # The protocol of your Foundry instance

# Application Configuration
config:
    debug:
        level: 0 # Debug level: 0=None, 1=Error, 2=Warn, 3=Info, 4=Debug
        foundryUser:
            name: Gamemaster   # Foundry username (GM/Assistant GM required)
            password: password # Foundry password
        chat-history: 100      # How much of the chat history to show in the application
```

### Running Locally
To run the application locally for personal use:

1.  Current directory:
    ```bash
    npm run build
    npm start
    ```
2.  Open [http://localhost:3000](http://localhost:3000).

### Deployment
To deploy on a dedicated server:

1.  Clone the repository.
2.  Install dependencies: `npm install`
3.  Build the application: `npm run build`
4.  Start the server: `npm start`
    - *Note: You may want to use a process manager like PM2 to keep it running.*

## Development
For developers interested in contributing to **SheetDelver**, please refer to [CONTRIBUTING.md](CONTRIBUTING.md) for detailed setup instructions, architecture overview, and guidelines.


