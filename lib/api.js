// BrightMinds backend client over node:http(s): JSON requests and streamed multipart uploads.
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');

const BASE_URL = (process.env.BM_API_URL || 'https://api.greenlights.us').replace(/\/+$/, '');
// Optional: connect to this IP instead of the DNS answer (e.g. the server's LAN IP when the router
// can't loop back to its own public IP). TLS still uses the hostname, so the certificate is valid.
const API_IP = process.env.BM_API_IP;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

const lookup = API_IP
  ? (hostname, options, callback) =>
      options.all ? callback(null, [{ address: API_IP, family: 4 }]) : callback(null, API_IP, 4)
  : undefined;

/** Builds an Error from a non-2xx response, using the backend's `{ error, message }` body when present. */
const responseError = (status, text) => {
  let message = text;
  try {
    const body = JSON.parse(text);
    message = body.message || body.error || body.response || text;
  } catch {
    // not JSON: keep the raw text
  }
  const error = new Error(`HTTP ${status}: ${String(message).slice(0, 300)}`);
  error.status = status;
  return error;
};

/**
 * Sends one request. `write(req)` writes the body and ends the request.
 * Resolves with the raw response body (Buffer); rejects on network errors and non-2xx statuses.
 */
const send = (method, path, { headers = {}, token, write = (req) => req.end() }) =>
  new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    if (token) headers.Authorization = `Bearer ${token}`;
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(url, { method, headers, lookup }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
        else reject(responseError(res.statusCode, body.toString('utf8')));
      });
      res.on('error', reject);
    });
    req.setTimeout(IDLE_TIMEOUT_MS, () => req.destroy(new Error(`no response from ${url.host}`)));
    req.on('error', (error) =>
      reject(new Error(`${method} ${url.host}${path}: ${error.message || error.code}`))
    );
    write(req);
  });

const parseJson = (buffer) => {
  const text = buffer.toString('utf8');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/** JSON request (body optional). Throws on non-2xx. */
const request = async (method, path, { token, json } = {}) => {
  const body = json === undefined ? null : Buffer.from(JSON.stringify(json));
  const headers = body ? { 'Content-Type': 'application/json', 'Content-Length': body.length } : {};
  return parseJson(await send(method, path, { headers, token, write: (req) => req.end(body) }));
};

const asciiFilename = (name) => name.replace(/[^\x20-\x7e]|"/g, '_');

/**
 * Multipart POST with string fields and one file (`file.path`, streamed, or `file.buffer`).
 * `onProgress(ratio)` is called while the file is sent.
 */
const upload = async (path, { token, fields = {}, file, onProgress }) => {
  const boundary = `----brightminds${crypto.randomBytes(12).toString('hex')}`;
  const fieldParts = Object.entries(fields).map(
    ([name, value]) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
  );
  const head = Buffer.from(
    fieldParts.join('') +
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; ` +
      `filename="${asciiFilename(file.filename)}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const fileSize = file.buffer ? file.buffer.length : fs.statSync(file.path).size;
  const total = head.length + fileSize + tail.length;

  const write = (req) => {
    req.write(head);
    if (file.buffer) return req.end(Buffer.concat([file.buffer, tail]));
    let sent = head.length;
    const stream = fs.createReadStream(file.path);
    stream.on('data', (chunk) => {
      sent += chunk.length;
      if (onProgress) onProgress(sent / total);
    });
    stream.on('error', (error) => req.destroy(error));
    stream.on('end', () => req.end(tail));
    return stream.pipe(req, { end: false });
  };

  const headers = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': total,
  };
  return parseJson(await send('POST', path, { headers, token, write }));
};

/** Downloads a file served by the backend (e.g. the BrightMinds icon used as a placeholder). */
const download = (path) => send('GET', path, {});

/** @returns {Promise<{ userId: string, token: string }>} */
const login = (email, password) => request('POST', '/user/login', { json: { email, password } });

module.exports = { BASE_URL, API_IP, request, upload, download, login };
