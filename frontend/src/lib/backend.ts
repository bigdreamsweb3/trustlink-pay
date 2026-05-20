const BACKEND_PROXY_PREFIX = "/backend";

export function buildBackendUrl(path: string) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  return `${BACKEND_PROXY_PREFIX}${cleanPath}`;
}
