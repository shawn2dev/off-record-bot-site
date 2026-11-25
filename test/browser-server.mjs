import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  try {
    if (url.pathname === '/dashboard') {
      const head = await readFile(resolve(root, 'head.html'), 'utf8');
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><html lang="ko"><head>${head}</head><body><header></header><main><div><p><a href="/widgets/off-record/off-record.html">/widgets/off-record/off-record.html</a></p></div></main><footer></footer></body></html>`);
      return;
    }
    if (url.pathname === '/test/fixture') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles/styles.css"><link rel="stylesheet" href="/widgets/off-record/off-record.css"></head><body class="appear off-record-page"><main><div class="off-record"><div class="off-record-root"></div></div></main><script type="module">
        import { mountDashboard } from '/scripts/off-record-dashboard.js';
        import { OffRecordClient } from '/scripts/off-record-auth.js';
        import { fixtureResponse } from '/test/fixtures.mjs';
        window.fixtureRequests=[];
        window.fixtureFailures={};
        const client = new OffRecordClient({origin:'https://api.offrecord.test', fetcher:async(url,init)=>{
          window.fixtureRequests.push({url,method:init.method,body:init.body});
          const failure=window.fixtureFailures[new URL(url).pathname];
          return failure?Response.json(failure.body,{status:failure.status}):Response.json(fixtureResponse(url));
        }});
        client.initialize=async()=>{client.token='fixture-only';client.expiresAt=Date.now()+300000;return {}};
        window.fixtureApp=await mountDashboard(document.querySelector('.off-record'),{client});
      </script></body></html>`);
      return;
    }
    const path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!path.startsWith(`${root}${sep}`) || url.pathname.startsWith('/.')) {
      response.writeHead(403);
      response.end();
      return;
    }
    response.setHeader('Content-Type', `${types[extname(path)] || 'application/octet-stream'}; charset=utf-8`);
    response.end(await readFile(path));
  } catch {
    response.writeHead(404);
    response.end();
  }
});
server.listen(Number(process.env.PORT) || 4173, '127.0.0.1', () => {
  console.log(`Dashboard test server: http://127.0.0.1:${server.address().port}/dashboard`);
});
