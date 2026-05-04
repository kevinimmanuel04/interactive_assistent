// pixi-live2d-display-lipsyncpatch internally calls
// `PIXI.utils.url.resolve(...)`, which was deprecated in PixiJS v7.3 and
// prints a console.warn on every access. PixiJS exposes `utils.url` via a
// getter that triggers the warning, so we can't assign to
// `utils.url.resolve` directly. Instead we redefine `utils.url` itself
// with a plain object that does the same job using the native URL API —
// the library still works, and PixiJS never fires its deprecation logger.

export function patchPixiUtilsUrl(PIXI: unknown): void {
  try {
    const utils = (PIXI as { utils?: Record<string, unknown> }).utils;
    if (!utils) return;
    Object.defineProperty(utils, "url", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: {
        resolve(base: string, path: string) {
          try {
            return new URL(path, base).href;
          } catch {
            return path;
          }
        },
        parse(input: string) {
          try {
            const u = new URL(input);
            return {
              protocol: u.protocol,
              slashes: true,
              auth: u.username ? `${u.username}:${u.password}` : null,
              host: u.host,
              port: u.port,
              hostname: u.hostname,
              hash: u.hash,
              search: u.search,
              query: u.search.startsWith("?") ? u.search.slice(1) : u.search,
              pathname: u.pathname,
              path: u.pathname + u.search,
              href: u.href,
            };
          } catch {
            return { href: input, pathname: input, path: input };
          }
        },
      },
    });
  } catch {
    /* property locked — warning will fire once, harmless */
  }
}
