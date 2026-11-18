/** Minimal explicit HTTP response port used by direct route tests. */
export function responseJson(data, options = {}) {
  return { data, status: options.status ?? 200, headers: options.headers ?? {} };
}
