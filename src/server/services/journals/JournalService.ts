import type {
    JournalClientLike,
    JournalMutationBody,
    JournalDeleteQuery,
    RawJournal,
    RawFolder,
    DocumentSocketResponse,
} from '@server/shared/types/documents';

export function createJournalService() {
    // Journal list projection with Foundry visibility filtering and folder ancestry pruning.
    const listJournals = async (client: JournalClientLike) => {
        const currentUserId = client.userId;
        const allJournals = await client.getJournals();
        const allFolders = await client.getFolders('JournalEntry');

        const users = await client.getUsers();
        const currentUser = users.find((u) => (u._id || u.id) === currentUserId);
        const isGM = (currentUser?.role || 0) >= 3;
        const resolvedUserId = currentUserId || undefined;

        const visibleJournals = allJournals.filter((j) => {
            if (isGM) return true;
            const level = (resolvedUserId ? j.ownership?.[resolvedUserId] : undefined) ?? j.ownership?.default ?? 0;
            return level >= 2;
        });

        const getFolderIdsWithVisibleJournals = (): Set<string> => {
            const folderIds = new Set<string>();
            visibleJournals.forEach((j) => {
                if (j.folder) {
                    let currentFolderId: string | null = j.folder;
                    while (currentFolderId) {
                        folderIds.add(currentFolderId);
                        const folder = allFolders.find((f) => f._id === currentFolderId);
                        currentFolderId = folder?.folder || null;
                    }
                }
            });
            return folderIds;
        };

        const visibleFolderIds = getFolderIdsWithVisibleJournals();
        const visibleFolders = allFolders.filter((f) => isGM || (!!f._id && visibleFolderIds.has(f._id)));

        return { journals: visibleJournals, folders: visibleFolders };
    };

    // Journal create orchestration (JournalEntry and Folder document types).
    const createJournal = async (client: JournalClientLike, body: JournalMutationBody) => {
        const { type, data } = body;
        const result = await client.dispatchDocumentSocket(type || 'JournalEntry', 'create', {
            data: [data],
            broadcast: true
        });
        return result;
    };

    // Journal detail fetch by document ID.
    const getJournalById = async (client: JournalClientLike, journalId: string) => {
        const response = await client.dispatchDocumentSocket('JournalEntry', 'get', {
            query: { _id: journalId },
            broadcast: false
        }) as DocumentSocketResponse<RawJournal>;
        const doc = response.result?.[0];

        if (!doc) return { error: 'Journal not found', status: 404 };
        return doc;
    };

    const updateJournal = async (client: JournalClientLike, journalId: string, body: JournalMutationBody) => {
        const { type, data } = body;
        const result = await client.dispatchDocumentSocket(type || 'JournalEntry', 'update', {
            updates: [{ ...data, _id: journalId }],
            broadcast: true
        });
        return result;
    };

    const deleteJournal = async (client: JournalClientLike, journalId: string, query: JournalDeleteQuery) => {
        const { type } = query;
        const resolvedType = Array.isArray(type) ? type[0] : type;
        const result = await client.dispatchDocumentSocket(resolvedType || 'JournalEntry', 'delete', {
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
