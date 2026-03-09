const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(process.cwd(), "dashboard");
const port = 4173;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

function resolveFile(urlPath) {
  const safePath = decodeURIComponent(urlPath.split("?")[0]);
  const target = safePath === "/" ? "/index.html" : safePath;
  const full = path.normalize(path.join(root, target));
  if (!full.startsWith(root)) return null;
  return full;
}

http
  .createServer((req, res) => {
    const filePath = resolveFile(req.url || "/");
    if (!filePath) {
      res.writeHead(400);
      res.end("Bad Request");
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not Found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(port, () => {
    console.log(`Dashboard em http://localhost:${port}`);
  });
