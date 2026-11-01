import { getToken } from '@/utils/token-store.js';

let controller = null;
let reconnectTimer = null;

function apiBase() {
  return (import.meta.env.VITE_BASE_URL || '/api').replace(/\/$/, '');
}

// SSE with the normal Authorization header: EventSource cannot set one, so
// this uses fetch streaming and reconnects when the connection drops.
export function startEmailEvents(onEmail) {
  stopEmailEvents();
  const token = getToken();
  if (!token) return;
  controller = new AbortController();
  const signal = controller.signal;

  const connect = async () => {
    if (signal.aborted) return;
    try {
      const response = await fetch(`${apiBase()}/email/events`, {
        headers: { Authorization: token, 'accept-language': 'zh-CN' },
        signal
      });
      if (!response.ok || !response.body) throw new Error(`SSE ${response.status}`);

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
          let event = 'message';
          const data = [];
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data.push(line.slice(5).trim());
          }
          if (event === 'email' && data.length) {
            try { onEmail?.(JSON.parse(data.join('\n'))); } catch (e) { /* ignore malformed event */ }
          }
        }
      }
    } catch (e) {
      if (signal.aborted) return;
    }
    if (!signal.aborted) reconnectTimer = setTimeout(connect, 5000);
  };

  connect();
}

export function stopEmailEvents() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  controller?.abort();
  controller = null;
}
