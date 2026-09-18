/* Tiny static dev server for ScaleMyLife (no dependencies).
   Serves the repo root on http://localhost:8123 so the app can be previewed
   exactly as Vercel serves it. Two deliberate behaviours:
   1. Cache-Control: no-store on everything, so a reload always shows the
      latest styles.css / app.js while iterating on design. Without this the
      browser heuristically caches assets and you end up debugging stale CSS.
   2. Unknown paths without a file extension fall back to index.html (SPA
      style), which matches how the hosted app behaves for deep links.
   The service worker in sw.js only registers over https, so it never
   interferes with localhost previews (see app.js, the location.protocol check). */
var http = require('http');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var PORT = Number(process.env.PORT) || 8123;
var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml'
};

http.createServer(function (req, res) {
  var url = decodeURIComponent((req.url || '/').split('?')[0]);
  var file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (file.indexOf(ROOT) !== 0) { res.writeHead(403); return res.end(); }   // no path traversal
  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) {
      if (!path.extname(url)) file = path.join(ROOT, 'index.html');          // SPA fallback
      else { res.writeHead(404, { 'Cache-Control': 'no-store' }); return res.end('not found'); }
    }
    fs.readFile(file, function (e2, buf) {
      if (e2) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(buf);
    });
  });
}).listen(PORT, '127.0.0.1', function () {
  console.log('ScaleMyLife dev server on http://localhost:' + PORT + ' serving ' + ROOT);
});
