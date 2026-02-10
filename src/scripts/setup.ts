
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const SETTINGS_PATH = path.join(process.cwd(), 'settings.yaml');

async function main() {
    console.log('\x1b[36m%s\x1b[0m', '--- SheetDelver Configuration Setup ---');

    if (fs.existsSync(SETTINGS_PATH)) {
        const { overwrite } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'overwrite',
                message: 'settings.yaml already exists. Overwrite?',
                default: false
            }
        ]);

        if (!overwrite) {
            console.log('Setup cancelled. Existing configuration preserved.');
            process.exit(0);
        }
    }

    const answers = await inquirer.prompt([
        // App Settings
        {
            type: 'input',
            name: 'appHost',
            message: 'App Host:',
            default: 'localhost'
        },
        {
            type: 'number',
            name: 'appPort',
            message: 'App Port:',
            default: 3000
        },
        {
            type: 'number',
            name: 'apiPort',
            message: 'API Port (internal):',
            default: 3001
        },
        {
            type: 'list',
            name: 'appProtocol',
            message: 'App Protocol:',
            choices: ['http', 'https'],
            default: 'http'
        },
        {
            type: 'number',
            name: 'chatHistory',
            message: 'Chat History Limit:',
            default: 100
        },
        // Foundry Settings
        {
            type: 'input',
            name: 'foundryHost',
            message: 'Foundry VTT Host:',
            default: 'localhost'
        },
        {
            type: 'number',
            name: 'foundryPort',
            message: 'Foundry VTT Port:',
            default: 30000
        },
        {
            type: 'list',
            name: 'foundryProtocol',
            message: 'Foundry VTT Protocol:',
            choices: ['http', 'https'],
            default: 'http'
        },
        {
            type: 'input',
            name: 'foundryUsername',
            message: 'Foundry Username (GM/Assistant):',
            default: 'gamemaster'
        },
        {
            type: 'password',
            name: 'foundryPassword',
            message: 'Foundry Password:',
        },
        {
            type: 'input',
            name: 'foundryDataDir',
            message: 'Foundry Data Directory (Optional, for imports):',
        },
        {
            type: 'confirm',
            name: 'debugEnabled',
            message: 'Enable Debug Logging?',
            default: false
        },
        {
            type: 'list',
            name: 'debugLevel',
            message: 'Debug Level:',
            choices: [
                { name: '0 - None', value: 0 },
                { name: '1 - Error', value: 1 },
                { name: '2 - Warn', value: 2 },
                { name: '3 - Info', value: 3 },
                { name: '4 - Debug', value: 4 }
            ],
            default: 1,
            when: (answers) => answers.debugEnabled
        }
    ]);

    const config = {
        app: {
            host: answers.appHost,
            port: answers.appPort,
            "api-port": answers.apiPort,
            protocol: answers.appProtocol,
            "chat-history": answers.chatHistory
        },
        foundry: {
            host: answers.foundryHost,
            port: answers.foundryPort,
            protocol: answers.foundryProtocol,
            connector: 'socket',
            username: answers.foundryUsername,
            password: answers.foundryPassword,
            ...(answers.foundryDataDir ? { foundryDataDirectory: answers.foundryDataDir } : {})
        },
        debug: {
            enabled: answers.debugEnabled,
            level: answers.debugLevel || 1
        }
    };

    const yamlStr = yaml.dump(config);
    fs.writeFileSync(SETTINGS_PATH, yamlStr, 'utf8');

    console.log('\n\x1b[32mConfiguration saved to settings.yaml\x1b[0m');
    console.log('You can now run:');
    console.log('  npm run dev      (Development)');
    console.log('  npm run build && npm start (Production)');
}

main().catch(err => {
    console.error('Setup failed:', err);
    process.exit(1);
});
