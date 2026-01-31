
async function main() {
    // Fetch system data to get actor ID if possible, or just guess/list
    // Since I don't know the actor ID easily without listing, I'll rely on the one in the open file or logs if I saw one.
    // The previous run logs showed: GET /actors/XTFS1KfVVO0uzTYK
    const actorId = 'XTFS1KfVVO0uzTYK';
    const url = `http://localhost:3000/api/actors/${actorId}`;

    console.log(`Fetching ${url}...`);
    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.log('Failed:', res.status, res.statusText);
            return;
        }
        const data = await res.json();
        actor.items.filter(i => i.type === 'Weapon');

        console.log('System Details:', JSON.stringify(data.debug.system.details, null, 2));
        console.log('System Notes:', JSON.stringify(data.debug.system.notes, null, 2));
        console.log('Top Level System Keys:', Object.keys(data.debug.system));
    } catch (e) {
        console.error(e);
    }
}

main();
