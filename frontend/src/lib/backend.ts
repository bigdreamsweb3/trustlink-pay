export const BACKEND_PROXY_PREFIX = "/backend";

export function buildBackendUrl(path: string) {
  return `${BACKEND_PROXY_PREFIX}${path}`;
}
