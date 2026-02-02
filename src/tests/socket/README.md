# Socket Client Tests

This directory contains tests for the `SocketFoundryClient` to validate that it can replace Playwright functionality for interacting with Foundry VTT.

## Test Structure

Tests are organized by functionality and numbered for execution order:

1. **01-connection.test.ts** - Basic connection and authentication
2. **02-system-info.test.ts** - System information retrieval
3. **03-actor-access.test.ts** - Actor data access
4. **04-users-compendia.test.ts** - User lists and compendium access

## Running Tests

### Run All Tests
```bash
npm run test:socket
```

### Run Individual Tests
```bash
npm run test:socket:connection  # Test 1: Connection
npm run test:socket:system      # Test 2: System Info
npm run test:socket:actors      # Test 3: Actor Access
npm run test:socket:users       # Test 4: Users & Compendia
```

## Prerequisites

1. **Environment Variable**: Set `FOUNDRY_PASSWORD` in your environment or `.env` file
2. **Foundry Server**: Ensure your target Foundry VTT server is running (configured in `settings.yaml`)
3. **Test User**: A valid user (e.g. Gamemaster or Assistant) must exist in the world
4. **Safety Check Disabled**: Tests will temporarily disable the safety check in `SocketClient.connect()`

## Test Categories

### Phase 1: Read-Only Operations (Safe)
- ✅ Connection and authentication
- ✅ System information retrieval
- ✅ Actor data access
- ✅ User lists
- ✅ Compendium indices

### Phase 2: Write Operations (Not Yet Implemented)
- ⏳ Actor creation
- ⏳ Actor updates
- ⏳ Item manipulation

## Safety Notes

> [!CAUTION]
> The socket connection is currently protected by a safety check that throws an error. Tests temporarily disable this check. **Monitor the Foundry server for stability during testing.**

## Expected Output

Each test will output:
- ✅ Success indicators for passing tests
- ❌ Failure indicators with error messages
- 📊 Summary with pass/fail counts

Example:
```
🧪 Test 1: Connection & Authentication

📡 Connecting...
✅ Connected successfully!
✅ Authentication successful (userId present in session)
📡 Disconnected

📊 1/1 tests passed
```

## Troubleshooting

### Connection Fails
- Verify Foundry server is running
- Check `FOUNDRY_PASSWORD` environment variable
- Ensure a valid user exists (as configured in settings.yaml)

### Server Crashes
- Re-enable the safety check in `SocketClient.ts`
- Report the issue with server logs
- Use passive connection mode only

### Tests Timeout
- Increase timeout in test files
- Check network connectivity
- Verify Foundry is not overloaded
