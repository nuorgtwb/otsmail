import { getToken } from '@/utils/token-store.js';

let ws = null;
let sseController = null;
let retryTimer = null;
let stopped = true;
let wsFailures = 0;

function apiBase() {
  return (import.meta.env.VITE_BASE_URL || '/api').replace(/\/$/, '');
}

function wsUrl(ticket) {
  const url = new URL(`${apiBase()}/email/wsock`, location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('ticket', ticket);
  return url.href;
}

function parseEventBlock(block) {
  let event = 'message';
  const data = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  return { event, data: data.join('\n') };
}

function startSse(token) {
  if (stopped) return;
  sseController?.abort();
  sseController = new AbortController();
  const signal = sseController.signal;
  const connect = async () => {
    if (stopped) return;
    try {
      const response = await fetch(`${apiBase()}/email/events`, {
        headers: { Authorization: token, 'accept-language': 'zh-CN' },
        signal
      });
      if (!response.ok || !response.body) throw new Error(`SSE ${response.status}`);
      if (!response.headers.get('content-type')?.includes('text/event-stream')) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';
        for (const block of blocks) {
          const { event, data } = parseEventBlock(block);
          if (event === 'email' && data) {
            try { onEmail(JSON.parse(data)); } catch { /* ignore */ }
          }
        }
      }
    } catch {
      if (signal.aborted) return;
    }
    if (!signal.aborted) retryTimer = setTimeout(connect, 5000);
  };
  connect();
}

let onEmail = () => {};

function connectWs(token) {
  if (stopped) return;
  fetch(`${apiBase()}/email/ws-ticket`, {
    method: 'POST',
    headers: { Authorization: token, 'accept-language': 'zh-CN' }
  }).then(async response => {
    if (!response.ok) throw new Error(`ticket ${response.status}`);
    const json = await response.json();
    const ticket = json?.data?.ticket || json?.ticket;
    if (!ticket) throw new Error('no ticket');
    ws = new WebSocket(wsUrl(ticket));
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message?.type === 'email') onEmail(message);
      } catch { /* ignore malformed frame */ }
    };
    ws.onerror = () => { try { ws?.close(); } catch { /* ignore */ } };
    ws.onclose = () => {
      if (stopped) return;
      wsFailures++;
      if (wsFailures >= 3) { startSse(token); return; }
      retryTimer = setTimeout(() => connectWs(token), 5000);
    };
  }).catch(() => {
    startSse(token);
  });
}

// WebSocket is the primary channel; SSE remains a fallback when Durable
// Objects are not configured or the network blocks WebSocket upgrades.
export function startEmailEvents(callback) {
  stopEmailEvents();
  const token = getToken();
  if (!token) return;
  stopped = false;
  wsFailures = 0;
  onEmail = typeof callback === 'function' ? callback : () => {};
  connectWs(token);
}

export function stopEmailEvents() {
  stopped = true;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  if (ws) {
    try { ws.close(); } catch { /* ignore */ }
    ws = null;
  }
  sseController?.abort();
  sseController = null;
}
