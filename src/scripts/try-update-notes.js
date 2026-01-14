async function main() {
    // Attempt to update the actor notes via API and check if it persists
    const actorId = 'XTFS1KfVVO0uzTYK'; // From previous log
    const url = `http://localhost:3000/api/actors/${actorId}/update`;

    // 1. Read current
    console.log('Reading current...');
    let res = await fetch(`http://localhost:3000/api/actors/${actorId}`);
    let data = await res.json();
    console.log('Current System Notes:', data.debug.system.notes);

    // 2. Update
    const newValue = `<p>Test Write to Details Notes ${new Date().toISOString()}</p>`;
    console.log(`Updating to: ${newValue}`);
    // Try writing to details.notes.value
    const payload = { "system.details.notes.value": newValue };

    res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const updateResult = await res.json();
    console.log('Update Result:', updateResult);

    // 3. Read back
    console.log('Reading back...');
    res = await fetch(`http://localhost:3000/api/actors/${actorId}`);
    data = await res.json();
    console.log('New System Notes:', data.debug.system.notes);
}

main();
