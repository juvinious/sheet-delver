interface ErrorPayload {
    error: string;
    status: number;
}

export function isErrorPayload(value: unknown): value is ErrorPayload {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const payload = value as Record<string, unknown>;
    return typeof payload.error === 'string' && typeof payload.status === 'number';
}
