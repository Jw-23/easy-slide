// Local production-artifact harness. Test endpoints are not part of the deployed application.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root = resolve("dist");
let revision = 0;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  if (path === "/__test__/release-next" && req.method === "POST") {
    revision++;
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({ revision }));
    return;
  }
  if (
    /^\/(api|signin-with-chatgpt|signout-with-chatgpt|callback|cdn-cgi|_sites)(?:\/|$)/.test(
      path,
    )
  ) {
    res.writeHead(401, { "Content-Type": "text/plain" });
    res.end("Authentication required");
    return;
  }
  try {
    const file = resolve(
      root,
      "." + decodeURIComponent(path === "/" ? "/index.html" : path),
    );
    if (!file.startsWith(root + "/") || path === "/_headers")
      throw Error("invalid path");
    let body;
    try {
      body = await readFile(file);
    } catch {
      if (extname(path)) throw Error("missing asset");
      body = await readFile(root + "/index.html");
    }
    if (path === "/sw.js")
      body = Buffer.concat([
        body,
        Buffer.from(`\n// Test release ${revision}\n`),
      ]);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "text/html; charset=utf-8",
      "Cache-Control": path.startsWith("/assets/")
        ? "public,max-age=31536000,immutable"
        : "no-cache",
      ...(path === "/sw.js" ? { "Service-Worker-Allowed": "/" } : {}),
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(4174, "127.0.0.1", () =>
  process.stdout.write("PWA production test server: http://127.0.0.1:4174\n"),
);
