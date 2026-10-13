const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../public');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg' };
function serve(port = 4173) {
    return http.createServer((req, res) => {
        let pathname;
        try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
        catch { res.writeHead(400).end(); return; }
        const target = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
        if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        fs.readFile(target, (error, content) => {
            if (error) { res.writeHead(404, {'Content-Type':'text/html'}); res.end(fs.readFileSync(path.join(root,'404.html'))); return; }
            res.writeHead(200, {'Content-Type':mime[path.extname(target)] || 'application/octet-stream'});
            res.end(content);
        });
    }).listen(port, '127.0.0.1');
}
module.exports = { serve };
if (require.main === module) { serve(); console.log('Local preview: http://127.0.0.1:4173'); }
