import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.join(__dirname, "dist");
const PORT = 5173;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function serveStatic(res, pathname) {
  let filePath = path.join(DIST_DIR, pathname);

  // SPA fallback
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
  } catch {
    filePath = path.join(DIST_DIR, "index.html");
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();

    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    });

    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // API lecture
    if (url.pathname === "/api/file" && req.method === "GET") {
      const filePath = url.searchParams.get("path");

      if (!filePath) {
        res.writeHead(400);
        res.end("Missing path parameter");
        return;
      }

      const content = await fs.readFile(filePath, "utf8");

      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
      });

      res.end(content);
      return;
    }

    // API écriture
    if (url.pathname === "/api/file" && req.method === "POST") {
      const filePath = url.searchParams.get("path");

      if (!filePath) {
        res.writeHead(400);
        res.end("Missing path parameter");
        return;
      }

      const chunks = [];

      for await (const chunk of req) {
        chunks.push(chunk);
      }

      await fs.writeFile(filePath, Buffer.concat(chunks));

      res.writeHead(200);
      res.end("OK");
      return;
    }

    // Fichiers statiques de dist/
    await serveStatic(res, url.pathname);
  } catch (err) {
    console.error(err);

    res.writeHead(500, {
      "Content-Type": "text/plain; charset=utf-8",
    });

    res.end(err.message);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Server running at http://localhost:${PORT}`);
});