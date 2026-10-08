#!/usr/bin/env python3
"""DEV/TEST ONLY - mimics how GitHub Pages serves a project site (never used by the app).
   python tools/pages-sim.py <dir> <prefix> <port> <logfile>
 - serves <dir> ONLY under <prefix>/  (e.g. /bti-quiz/).  Anything else -> 404 and is logged (catches "/" path bugs)
 - /bti-quiz -> 301 -> /bti-quiz/   (as Pages does)
 - Cache-Control: max-age=600 (GitHub's default 10-minute HTTP cache) + Last-Modified / 304 revalidation
 - no server-side logic of any kind: plain files only
"""
import http.server, json, mimetypes, sys, urllib.parse

root, prefix, port, logfile = sys.argv[1], sys.argv[2].rstrip('/'), int(sys.argv[3]), sys.argv[4]
mimetypes.add_type('application/manifest+json', '.webmanifest'); mimetypes.add_type('text/javascript', '.js')

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=root, **k)
    def log_message(self, *a): pass
    def send_response(self, code, message=None):
        super().send_response(code, message)
        with open(logfile, 'a') as f: f.write(json.dumps({'method': self.command, 'path': self._orig, 'code': code}) + '\n')
    def end_headers(self):
        self.send_header('Cache-Control', 'max-age=600'); self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()
    def _route(self, send):
        parts = urllib.parse.urlsplit(self.path); self._orig = parts.path
        if parts.path == prefix:
            self.send_response(301); self.send_header('Location', prefix + '/'); self.end_headers(); return
        if not parts.path.startswith(prefix + '/'):
            self.send_error(404, 'outside ' + prefix); return
        self.path = parts.path[len(prefix):] or '/'
        return send(self)
    def do_GET(self): self._route(lambda s: http.server.SimpleHTTPRequestHandler.do_GET(s))
    def do_HEAD(self): self._route(lambda s: http.server.SimpleHTTPRequestHandler.do_HEAD(s))

http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
