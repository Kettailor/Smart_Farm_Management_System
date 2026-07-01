import { APP_BASE_PATH } from "@/lib/app-path";

const runtimeScript = `
(() => {
  const basePath = ${JSON.stringify(APP_BASE_PATH)};
  if (!basePath || window.__farmBasePathRuntime) return;
  window.__farmBasePathRuntime = true;

  const shouldPrefix = (pathname) =>
    pathname === "/" ||
    /^\\/(?:api|assets|dashboard|favicon\\.ico|login|next-assets|p|public|register|uploads)(?:\\/|$|\\?)/.test(pathname);

  const prefixPath = (pathname) => {
    if (!pathname || !pathname.startsWith("/") || pathname === basePath || pathname.startsWith(basePath + "/")) return pathname;
    return shouldPrefix(pathname) ? basePath + pathname : pathname;
  };

  const prefixUrl = (value) => {
    if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return value;
    const [pathAndSearch, hash = ""] = value.split("#");
    const queryIndex = pathAndSearch.indexOf("?");
    const pathname = queryIndex >= 0 ? pathAndSearch.slice(0, queryIndex) : pathAndSearch;
    const search = queryIndex >= 0 ? pathAndSearch.slice(queryIndex) : "";
    const nextPathname = prefixPath(pathname);
    return nextPathname === pathname ? value : nextPathname + search + (hash ? "#" + hash : "");
  };

  const originalFetch = window.fetch;
  window.fetch = function farmFetch(input, init) {
    if (typeof input === "string") {
      return originalFetch.call(this, prefixUrl(input), init);
    }

    if (input instanceof Request) {
      const url = new URL(input.url, window.location.origin);
      if (url.origin === window.location.origin) {
        const nextPathname = prefixPath(url.pathname);
        if (nextPathname !== url.pathname) {
          url.pathname = nextPathname;
          return originalFetch.call(this, new Request(url.toString(), input), init);
        }
      }
    }

    return originalFetch.call(this, input, init);
  };

  document.addEventListener("click", (event) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!anchor || anchor.target || anchor.hasAttribute("download") || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const url = new URL(anchor.getAttribute("href"), window.location.href);
    if (url.origin !== window.location.origin) return;

    const nextPathname = prefixPath(url.pathname);
    if (nextPathname === url.pathname) return;

    event.preventDefault();
    url.pathname = nextPathname;
    window.location.assign(url.toString());
  });
})();
`;

export default function BasePathRuntime() {
  if (!APP_BASE_PATH) return null;
  return <script id="farm-base-path-runtime" dangerouslySetInnerHTML={{ __html: runtimeScript }} />;
}
