import fs from "node:fs/promises";

export function filePlugin() {
  return {
    name: "local-file-api",
    configureServer(server) {
      server.middlewares.use("/api/file", async (req, res) => {
        const url = new URL(req.url, "http://localhost");
        const filePath = url.searchParams.get("path");

        if (!filePath) {
          res.statusCode = 400;
          res.end("Missing 'path' parameter");
          return;
        }

        try {
          if (req.method === "GET") {
            const content = await fs.readFile(filePath, "utf-8");
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end(content);
          } else if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", async () => {
              await fs.writeFile(filePath, body, "utf-8");
              res.statusCode = 200;
              res.end("OK");
            });
          } else {
            res.statusCode = 405;
            res.end("Method not allowed");
          }
        } catch (err) {
          res.statusCode = 500;
          res.end(`Error: ${err.message}`);
        }
      });
    },
  };
}