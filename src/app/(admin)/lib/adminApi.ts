export function adminApiPath(path: string): string {
  return `/api/admin${path.startsWith('/') ? path : `/${path}`}`;
}