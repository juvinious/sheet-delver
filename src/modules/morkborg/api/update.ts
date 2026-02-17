/**
 * Mörk Borg Module API - Update Handler
 * Handles actor property updates
 */

export async function handleUpdateActor(actorId: string, request: Request, client: any) {
    if (!client) {
        return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const { path, value } = await request.json();

        if (!path) {
            return Response.json({ error: 'Missing path parameter' }, { status: 400 });
        }

        // Update actor property
        await client.updateActor(actorId, { [path]: value });

        // Fetch updated actor
        const updatedActor = await client.getActor(actorId);

        return Response.json({
            success: true,
            actor: updatedActor
        });
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}
