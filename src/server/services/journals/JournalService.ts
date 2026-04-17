export function createJournalService() {
    // Journal list projection with Foundry visibility filtering and folder ancestry pruning.
    const listJournals = async (client: any) => {
        const currentUserId = client.userId;
        const allJournals = await client.getJournals();
        const allFolders = await client.getFolders('JournalEntry');

        const users = await client.getUsers();
        const currentUser = users.find((u: any) => (u._id || u.id) === currentUserId);
        const isGM = (currentUser?.role >= 3) || false;

        const visibleJournals = allJournals.filter((j: any) => {
            if (isGM) return true;
            const level = j.ownership?.[currentUserId] ?? j.ownership?.default ?? 0;
            return level >= 2;
        });

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

        return { journals: visibleJournals, folders: visibleFolders };
    };

    // Journal create orchestration (JournalEntry and Folder document types).
    const createJournal = async (client: any, body: any) => {
        const { type, data } = body;
        const result = await client.dispatchDocumentSocket(type || 'JournalEntry', 'create', {
            data: [data],
            broadcast: true
        });
        return result;
    };

    // Journal detail fetch by document ID.
    const getJournalById = async (client: any, journalId: string) => {
        const response = await client.dispatchDocumentSocket('JournalEntry', 'get', {
            query: { _id: journalId },
            broadcast: false
        });
        const doc = response.result?.[0];

        if (!doc) return { error: 'Journal not found', status: 404 };
        return doc;
    };

    const updateJournal = async (client: any, journalId: string, body: any) => {
        const { type, data } = body;
        const result = await client.dispatchDocumentSocket(type || 'JournalEntry', 'update', {
            updates: [{ ...data, _id: journalId }],
            broadcast: true
        });
        return result;
    };

    const deleteJournal = async (client: any, journalId: string, query: any) => {
        const { type } = query;
        const result = await client.dispatchDocumentSocket((type as string) || 'JournalEntry', 'delete', {
            ids: [journalId],
            broadcast: true
        });
        return result;
    };

    return {
        listJournals,
        createJournal,
        getJournalById,
        updateJournal,
        deleteJournal
    };
}
