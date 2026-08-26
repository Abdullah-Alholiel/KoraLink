// Definitive test: which namespace does the deployed API actually accept?
// Run from repo root: node scripts/ws-namespace-probe.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { io } = require('socket.io-client');

const BASE = 'http://100.93.99.24:3001';
const candidates = [
  `${BASE}/lobby`,        // matches @WebSocketGateway({ namespace: '/lobby' })
  `${BASE}/api/v1/lobby`, // what io(`${NEXT_PUBLIC_API_URL}/lobby`) actually produces
];

for (const url of candidates) {
  await new Promise((resolve) => {
    const s = io(url, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: false,
      timeout: 4000,
    });
    const done = (label) => {
      console.log(`${url} -> ${label}`);
      s.disconnect();
      resolve();
    };
    s.on('connect', () => done('CONNECTED (namespace accepted)'));
    s.on('connect_error', (e) => done(`connect_error: ${e.message}`));
    setTimeout(() => done('TIMEOUT'), 4500);
  });
}
process.exit(0);
