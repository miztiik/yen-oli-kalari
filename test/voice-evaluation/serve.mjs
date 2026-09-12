/**
 * A static file server for looking at the evaluation page in a browser.
 *
 * The page is built to open straight from a file path and needs no server at
 * all. This exists only for automated checks, which browsers refuse to run
 * against `file://`, and for anyone who would rather use a URL.
 *
 * Usage:
 *   npm run serve        # then open http://127.0.0.1:8791/page/index.html
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("./", import.meta.url));
const PORT = Number(process.env.PORT ?? 8791);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};

createServer(async (req, res) => {
  const requested = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const relative = normalize(requested).replace(/^([/\\])+/, "");
  const path = join(ROOT, relative === "" ? "page/index.html" : relative);

  // Normalising above collapses `..`, so a path that still escapes the root is
  // a traversal attempt rather than a mistake.
  if (!path.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const body = await readFile(path);
    const type = TYPES[extname(path)] ?? "application/octet-stream";

    /* Range support, because a media element that cannot issue a range request
       reports `duration` as Infinity and the player's track loses its scale.
       GitHub Pages serves ranges, so a local server that does not would hide a
       class of bug rather than surface it. */
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (match) {
        const start = match[1] === "" ? body.length - Number(match[2]) : Number(match[1]);
        const end = match[1] === "" || match[2] === "" ? body.length - 1 : Number(match[2]);
        if (Number.isFinite(start) && start >= 0 && start <= end && end < body.length) {
          res.writeHead(206, {
            "Content-Type": type,
            "Content-Range": `bytes ${start}-${end}/${body.length}`,
            "Content-Length": end - start + 1,
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store",
          });
          res.end(body.subarray(start, end + 1));
          return;
        }
        res.writeHead(416, { "Content-Range": `bytes */${body.length}` }).end();
        return;
      }
    }

    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": body.length,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${PORT}/page/index.html`);
});
