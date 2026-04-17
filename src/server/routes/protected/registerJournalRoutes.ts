import express from 'express';

export function registerJournalRoutes(appRouter: express.Router) {
    appRouter.get('/journals', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const currentUserId = client.userId;
            const allJournals = await client.getJournals();
            const allFolders = await client.getFolders('JournalEntry');

            const users = await client.getUsers();
            const currentUser = users.find((u: any) => (u._id || u.id) === currentUserId);
            const isGM = (currentUser?.role >= 3) || false;

            const visibleJournals = allJournals.filter((j: any) => {
                if (isGM) return true;
                const level = j.ownership?.[currentUserId] ?? j.ownership?.default ?? 0;
                return level >= 2; // Observer or better
            });

            // Filter folders: only show if they contain (directly or indirectly) a visible journal
            const getFolderIdsWithVisibleJournals = (): Set<string> => {
                const folderIds = new Set<string>();
                visibleJournals.forEach((j: any) => {
                    if (j.folder) {
                        let currentFolderId = j.folder;
                        while (currentFolderId) {
                            folderIds.add(currentFolderId);
                            const folder = allFolders.find((f: any) => f._id === currentFolderId);
                            currentFolderId = folder?.folder || null;
                        }
                    }
                });
                return folderIds;
            };

            const visibleFolderIds = getFolderIdsWithVisibleJournals();
            const visibleFolders = allFolders.filter((f: any) => isGM || visibleFolderIds.has(f._id));

            res.json({ journals: visibleJournals, folders: visibleFolders });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/journals', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const { type, data } = req.body; // type: 'JournalEntry' | 'Folder'
            const result = await client.dispatchDocumentSocket(type || 'JournalEntry', 'create', {
                data: [data], // Wrap in array as required by DatabaseBackend#create
                broadcast: true
            });
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.get('/journals/:id', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const uuid = req.params.id;
            const response = await client.dispatchDocumentSocket('JournalEntry', 'get', {
                query: { _id: uuid },
                broadcast: false
            });
            const doc = response.result?.[0];

            if (!doc) return res.status(404).json({ error: 'Journal not found' });
            res.json(doc);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.patch('/journals/:id', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const { type, data } = req.body;
            const result = await client.dispatchDocumentSocket(type || 'JournalEntry', 'update', {
                updates: [{ ...data, _id: req.params.id }],
                broadcast: true
            });
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.delete('/journals/:id', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const { type } = req.query;
            const result = await client.dispatchDocumentSocket((type as string) || 'JournalEntry', 'delete', {
                ids: [req.params.id],
                broadcast: true
            });
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });
}
