// Simple CORS proxy for Figma plugin development.
// Figma dev plugins run in a data: URI iframe (origin "null"),
// which causes CORS preflight failures with Confluence API.
// This proxy forwards requests and adds permissive CORS headers.
//
// Usage: node proxy-server.js
// Then the plugin routes Confluence calls through http://localhost:3001

const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = 3001;

const server = http.createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  // Extract target URL from the path: /proxy/<encoded-url>
  const match = req.url.match(/^\/proxy\/(.+)$/);
  if (!match) {
    res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('Usage: /proxy/<encoded-target-url>');
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(decodeURIComponent(match[1]));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('Invalid target URL');
    return;
  }

  // Only allow proxying to atlassian.net
  if (!targetUrl.hostname.endsWith('.atlassian.net')) {
    res.writeHead(403, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('Only *.atlassian.net domains are allowed');
    return;
  }

  // Collect request body
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);

    const options = {
      hostname: targetUrl.hostname,
      port: 443,
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers: {},
    };

    // Forward relevant headers
    if (req.headers['authorization']) options.headers['Authorization'] = req.headers['authorization'];
    if (req.headers['content-type']) options.headers['Content-Type'] = req.headers['content-type'];
    if (req.headers['accept']) options.headers['Accept'] = req.headers['accept'];
    if (body.length > 0) options.headers['Content-Length'] = body.length;

    const proxyReq = https.request(options, (proxyRes) => {
      const responseHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': proxyRes.headers['content-type'] || 'application/json',
      };
      res.writeHead(proxyRes.statusCode, responseHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('Proxy error: ' + err.message);
    });

    if (body.length > 0) proxyReq.write(body);
    proxyReq.end();
  });
});

server.listen(PORT, () => {
  console.log('CORS proxy running on http://localhost:' + PORT);
  console.log('Route: /proxy/<encoded-confluence-url>');
});
