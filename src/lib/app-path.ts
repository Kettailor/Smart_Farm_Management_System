export function normalizeBasePath(value: string | undefined | null) {
  const cleanValue = String(value ?? "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  return cleanValue ? `/${cleanValue}` : "";
}

export const APP_BASE_PATH = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

function isExternalPath(path: string) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(path);
}

export function withBasePath(path: string) {
  if (!path || !APP_BASE_PATH || isExternalPath(path) || !path.startsWith("/")) return path;
  if (path === APP_BASE_PATH || path.startsWith(`${APP_BASE_PATH}/`)) return path;
  return `${APP_BASE_PATH}${path}`;
}

export function withoutBasePath(path: string) {
  if (!path || !APP_BASE_PATH) return path;
  if (path === APP_BASE_PATH) return "/";
  if (path.startsWith(`${APP_BASE_PATH}/`)) return path.slice(APP_BASE_PATH.length) || "/";
  return path;
}

export function buildAppUrl(baseUrl: string, path: string) {
  const base = new URL(baseUrl);
  const basePath = APP_BASE_PATH || normalizeBasePath(base.pathname);
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const pathWithBase =
    basePath && cleanPath !== basePath && !cleanPath.startsWith(`${basePath}/`)
      ? `${basePath}${cleanPath}`
      : cleanPath;

  return new URL(pathWithBase, base.origin).toString();
}
