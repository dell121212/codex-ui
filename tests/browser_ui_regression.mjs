import { spawn } from 'node:child_process';

const devPort = 5174;
const debugPort = 9333;
const pageUrl = `http://127.0.0.1:${devPort}/?preview=weekly&providers=codex`;
const vite = spawn('npm', [
  'run',
  'dev',
  '--',
  '--host',
  '127.0.0.1',
  '--port',
  String(devPort),
], { stdio: 'ignore' });

await waitForHttp(`http://127.0.0.1:${devPort}/`);

const chromium = spawn('chromium', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  `--remote-debugging-port=${debugPort}`,
  '--user-data-dir=/tmp/codex-ui-browser-regression',
  '--window-size=940,720',
  pageUrl,
], { stdio: 'ignore' });

let socket;
try {
  const target = await waitForTarget();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(JSON.stringify(message.error)));
    else handler.resolve(message.result);
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await send('Runtime.enable');
  await waitForExpression(send, 'document.readyState === "complete" && document.querySelectorAll(".provider-palette-item").length >= 6');

  const geometry = await evaluate(send, `(() => {
    const source = [...document.querySelectorAll('.provider-palette-item')]
      .find((node) => node.textContent.includes('Grok'));
    const target = document.querySelector('.provider-dashboard-dropzone');
    if (!source || !target) return null;
    const a = source.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    return {
      source: { x: a.left + a.width / 2, y: a.top + a.height / 2 },
      target: { x: b.left + b.width / 2, y: Math.min(b.bottom - 30, b.top + 220) },
    };
  })()`);
  if (!geometry) throw new Error('Could not locate drag source or drop zone.');

  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: geometry.source.x,
    y: geometry.source.y,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: geometry.source.x,
    y: geometry.source.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  for (let step = 1; step <= 8; step += 1) {
    const progress = step / 8;
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: geometry.source.x + (geometry.target.x - geometry.source.x) * progress,
      y: geometry.source.y + (geometry.target.y - geometry.source.y) * progress,
      button: 'left',
      buttons: 1,
    });
  }
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: geometry.target.x,
    y: geometry.target.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });

  await new Promise((resolve) => setTimeout(resolve, 500));
  const result = await evaluate(send, `(() => {
    const sizeOf = (node) => {
      const rect = node.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    };
    return {
      cards: [...document.querySelectorAll('.sortable-provider-card')].map(sizeOf),
      palette: [...document.querySelectorAll('.provider-palette-item')].map(sizeOf),
      resetText: document.querySelector('.reset-panel--embedded')?.textContent ?? '',
      hasCustomQuit: Boolean(document.querySelector('.app-toolbar-button--quit')),
      persisted: localStorage.getItem('codex-ui-dashboard-providers-v1'),
    };
  })()`);
  const sameSize = (items) => items.every((item) => (
    item.width === items[0]?.width && item.height === items[0]?.height
  ));
  if (
    result.cards.length !== 2
    || !sameSize(result.cards)
    || !sameSize(result.palette)
    || !result.resetText.includes('2 次')
    || !result.resetText.includes('重置')
    || result.hasCustomQuit
    || !String(result.persisted).includes('grok')
  ) {
    throw new Error(`Drag regression failed: ${JSON.stringify(result)}`);
  }

  await evaluate(send, `(() => {
    const button = [...document.querySelectorAll('.app-toolbar-nav-item')]
      .find((node) => node.textContent.includes('用量分析'));
    button?.click();
    return Boolean(button);
  })()`);
  await waitForExpression(send, 'document.querySelectorAll(".provider-analysis-row").length === 6');
  const analysis = await evaluate(send, `({
    providers: document.querySelectorAll('.provider-analysis-row').length,
    summary: [...document.querySelectorAll('.workspace-summary-strip--portfolio .workspace-metric')]
      .map((node) => node.textContent.replace(/\\s+/g, ' ').trim()),
    modelTitle: document.querySelector('.usage-detail-grid--portfolio .card-label')?.textContent ?? '',
  })`);
  if (
    analysis.providers !== 6
    || !analysis.summary.some((item) => item.includes('今日总 Token'))
    || !analysis.summary.some((item) => item.includes('综合 API 估价'))
    || !analysis.modelTitle.includes('本月跨公司模型用量')
  ) {
    throw new Error(`Usage analysis regression failed: ${JSON.stringify(analysis)}`);
  }

  console.log('Browser drag regression passed:', {
    cards: result.cards,
    paletteItem: result.palette[0],
    resetText: result.resetText.replace(/\s+/g, ' ').trim(),
    persisted: result.persisted,
    analysisProviders: analysis.providers,
  });
} finally {
  socket?.close();
  chromium.kill('SIGTERM');
  vite.kill('SIGTERM');
}

async function waitForTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page');
      if (page) return page;
    } catch {
      // Chromium is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Chromium DevTools endpoint did not start.');
}

async function waitForHttp(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  vite.kill('SIGTERM');
  throw new Error('Vite preview server did not start.');
}

async function evaluate(send, expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitForExpression(send, expression) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await evaluate(send, expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}
