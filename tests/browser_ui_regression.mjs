import { spawn } from 'node:child_process';

const devPort = 5174;
const debugPort = 9333;
const pageUrl = `http://127.0.0.1:${devPort}/?preview=dual&providers=codex`;
const vite = spawn('pnpm', [
  'dev',
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
  await evaluate(send, `(() => {
    localStorage.removeItem('codex-ui-dashboard-providers-v1');
    localStorage.removeItem('codex_local_token_subtotal_v1');
  })()`);
  await send('Page.reload');
  await waitForExpression(send, 'document.readyState === "complete" && document.querySelectorAll(".provider-palette-item").length >= 6');

  const companionBefore = await evaluate(send, `(() => {
    const character = document.querySelector('.workspace-companion-character');
    const refresh = document.querySelector('.app-toolbar-button--sync');
    const health = refresh?.querySelector('.app-toolbar-health');
    const sync = document.querySelector('.app-toolbar-sync');
    const toolbar = document.querySelector('.app-toolbar');
    const refreshRect = refresh?.getBoundingClientRect();
    const healthRect = health?.getBoundingClientRect();
    const syncRect = sync?.getBoundingClientRect();
    const toolbarRect = toolbar?.getBoundingClientRect();
    character?.click();
    return {
      hasCharacter: Boolean(character),
      initialImage: character?.querySelector('img')?.getAttribute('src') ?? '',
      headerText: document.querySelector('.workspace-header')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
      sourceText: document.querySelector('.usage-hero-brand-subtitle')?.textContent ?? '',
      primaryQuotaLabel: document.querySelector('.usage-hero-kicker')?.textContent ?? '',
      secondaryQuotaLabel: document.querySelector('.usage-secondary-head span')?.textContent ?? '',
      refreshRect: refreshRect ? { left: refreshRect.left, width: refreshRect.width } : null,
      syncRect: syncRect ? { left: syncRect.left, width: syncRect.width } : null,
      syncDisplay: sync ? getComputedStyle(sync).display : null,
      syncJustify: sync ? getComputedStyle(sync).justifyContent : null,
      refreshStyle: refresh ? {
        marginLeft: getComputedStyle(refresh).marginLeft,
        marginRight: getComputedStyle(refresh).marginRight,
        position: getComputedStyle(refresh).position,
        transform: getComputedStyle(refresh).transform,
      } : null,
      toolbarRect: toolbarRect ? { left: toolbarRect.left, width: toolbarRect.width } : null,
      usagePeriods: [...document.querySelectorAll('.provider-dashboard-extras .usage-period-card')]
        .map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
      currentHero: document.querySelector('.usage-hero-title')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      currentHeroTitle: document.querySelector('.usage-hero-title strong')?.getAttribute('title') ?? '',
      currentHeroAria: document.querySelector('.usage-hero-title strong')?.getAttribute('aria-label') ?? '',
      previousHero: document.querySelector('.usage-hero-previous')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      previousHeroAria: document.querySelector('.usage-hero-previous')?.getAttribute('aria-label') ?? '',
      periodValues: [...document.querySelectorAll('.provider-dashboard-extras .usage-period-card strong')]
        .map((node) => ({
          text: node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          title: node.getAttribute('title') ?? '',
          aria: node.getAttribute('aria-label') ?? '',
        })),
      tokenStyles: [...document.querySelectorAll('.usage-hero-local-value, .usage-period-card strong, .token-subtotal-panel strong, .model-stats > span')]
        .map((node) => {
          const style = getComputedStyle(node);
          return { fontFamily: style.fontFamily, fontVariantNumeric: style.fontVariantNumeric };
        }),
      officialRing: document.querySelector('.usage-ring')?.getAttribute('aria-label') ?? '',
      timeProgress: document.querySelector('.usage-hero-progress')?.getAttribute('aria-label') ?? '',
      officialField: [...document.querySelectorAll('.usage-stat')]
        .find((node) => node.textContent.includes('官方额度'))?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      officialSecondaryMeta: document.querySelector('.usage-secondary-meta')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      quotaSurfaces: [
        '.usage-hero',
        '.usage-period-card',
        '.token-subtotal-panel',
        '.usage-stat',
        '.usage-secondary',
        '.reset-panel--embedded',
      ].map((selector) => ({
        selector,
        background: getComputedStyle(document.querySelector(selector)).backgroundColor,
      })),
      periodTopRows: [...document.querySelectorAll('.provider-dashboard-extras .usage-period-card')]
        .map((node) => Math.round(node.getBoundingClientRect().top)),
      refreshCenterDelta: refreshRect && toolbarRect
        ? Number(((refreshRect.left + refreshRect.width / 2) - (toolbarRect.left + toolbarRect.width / 2)).toFixed(2))
        : null,
      refreshCentered: Boolean(
        refreshRect
        && toolbarRect
        && Math.abs((refreshRect.left + refreshRect.width / 2) - (toolbarRect.left + toolbarRect.width / 2)) <= 1
      ),
      healthInsideRefresh: Boolean(
        refreshRect
        && healthRect
        && healthRect.left >= refreshRect.left
        && healthRect.right <= refreshRect.right
        && healthRect.top >= refreshRect.top
        && healthRect.bottom <= refreshRect.bottom
      ),
    };
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 120));
  await evaluate(send, `document.querySelector('.workspace-companion-switcher')?.click()`);
  await waitForExpression(send, 'Boolean(document.querySelector(\'[aria-label="选择可莉"]\'))');
  const companionAfter = await evaluate(send, `(() => {
    const character = document.querySelector('.workspace-companion-character');
    const klee = document.querySelector('[aria-label="选择可莉"]');
    klee?.click();
    return {
      actionImage: character?.querySelector('img')?.getAttribute('src') ?? '',
      message: document.querySelector('.workspace-companion-message')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
      selectedKlee: klee?.getAttribute('aria-pressed') === 'true',
    };
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const persistedCompanion = await evaluate(send, `localStorage.getItem('codex-ui-companion-v1')`);
  if (
    !companionBefore.hasCharacter
    || companionBefore.headerText.includes('OVERVIEW')
    || companionBefore.headerText.includes('聚合本地 AI 工具')
    || !companionBefore.headerText.includes('用量概览')
    || !companionBefore.refreshCentered
    || !companionBefore.healthInsideRefresh
    || companionBefore.sourceText.includes('Codex app-server')
    || companionBefore.primaryQuotaLabel !== '本地'
    || companionBefore.secondaryQuotaLabel !== '官方额度 · 周额度'
    || companionBefore.usagePeriods.length !== 3
    || !companionBefore.usagePeriods.some((item) => item.includes('本期'))
    || !companionBefore.usagePeriods.some((item) => item.includes('上期'))
    || !companionBefore.usagePeriods.some((item) => item.includes('总计'))
    || companionBefore.currentHero.includes('18%')
    || !companionBefore.currentHero.includes('0.384M')
    || !companionBefore.currentHeroTitle.includes('384,200')
    || companionBefore.currentHeroAria !== '384,200 Token'
    || !companionBefore.previousHero.includes('上期 0.192M Token')
    || companionBefore.previousHeroAria !== '上一周期 192,000 Token'
    || companionBefore.periodValues.length !== 3
    || companionBefore.periodValues[0]?.text !== '0.384M'
    || companionBefore.periodValues[0]?.title !== '384,200 Token'
    || companionBefore.periodValues[0]?.aria !== '384,200 Token'
    || companionBefore.periodValues[1]?.text !== '2.84M'
    || companionBefore.periodValues[1]?.title !== '2,840,000 Token'
    || companionBefore.periodValues[2]?.text !== '8.52M'
    || companionBefore.periodValues[2]?.title !== '8,520,000 Token'
    || companionBefore.tokenStyles.length < 4
    || companionBefore.tokenStyles.some(({ fontFamily, fontVariantNumeric }) => /Georgia|Times|(?:^|,\s*)serif(?:,|$)/i.test(fontFamily) || !/lining-nums/.test(fontVariantNumeric) || !/tabular-nums/.test(fontVariantNumeric))
    || !companionBefore.officialRing.includes('官方额度 · 5 小时')
    || companionBefore.timeProgress !== '周期时间进度'
    || !companionBefore.officialField.includes('官方额度 · 5 小时')
    || !companionBefore.officialSecondaryMeta.includes('上限 100')
    || companionBefore.officialSecondaryMeta.includes('<0.001M Token')
    || companionBefore.officialSecondaryMeta.includes('0.000M Token')
    || companionBefore.quotaSurfaces.some(({ background }) => {
      const channels = background.match(/\d+/g)?.map(Number) ?? [];
      return channels.length < 3 || Math.min(...channels) > 210;
    })
    || new Set(companionBefore.periodTopRows).size !== 1
    || !companionAfter.actionImage.includes('/expressions/')
    || !companionAfter.message.includes('互动')
    || persistedCompanion !== 'klee'
  ) {
    throw new Error(`Companion/header regression failed: ${JSON.stringify({
      companionBefore,
      companionAfter,
      persistedCompanion,
    })}`);
  }

  const desktopOverflows = await collectVisibleOverflow(send);
  if (desktopOverflows.length) {
    throw new Error(`Desktop visible-text overflow: ${JSON.stringify(desktopOverflows)}`);
  }

  await evaluate(send, `document.querySelector('.token-subtotal-reset')?.click()`);
  await waitForExpression(send, `document.querySelector('.token-subtotal-panel strong')?.textContent?.includes('0.000M Token')`);
  await waitForExpression(send, `document.querySelector('.token-subtotal-feedback')?.textContent?.includes('本地小计已归零')`);
  await send('Page.reload');
  await waitForExpression(send, `document.readyState === 'complete' && document.querySelector('.token-subtotal-panel strong')?.textContent?.includes('0.000M Token')`);
  const subtotalAfterReload = await evaluate(send, `({
    value: document.querySelector('.token-subtotal-panel strong')?.textContent ?? '',
    month: [...document.querySelectorAll('.provider-dashboard-extras .usage-period-card')].find((node) => node.textContent.includes('本月'))?.textContent ?? '',
    total: [...document.querySelectorAll('.provider-dashboard-extras .usage-period-card')].find((node) => node.textContent.includes('总计'))?.textContent ?? '',
    officialReset: document.querySelector('.reset-panel--embedded .reset-btn')?.textContent ?? '',
  })`);
  if (
    !subtotalAfterReload.value.includes('0.000M Token')
    || !subtotalAfterReload.month.includes('2.84M')
    || !subtotalAfterReload.total.includes('8.52M')
    || !subtotalAfterReload.officialReset.includes('重置')
  ) {
    throw new Error(`Local subtotal regression failed: ${JSON.stringify(subtotalAfterReload)}`);
  }

  await send('Emulation.setDeviceMetricsOverride', {
    width: 620,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const narrowPeriods = await evaluate(send, `(() => {
    const cards = [...document.querySelectorAll('.provider-dashboard-extras .usage-period-card')];
    const scroller = document.querySelector('.usage-period-scroll');
    return {
      count: cards.length,
      tops: cards.map((node) => Math.round(node.getBoundingClientRect().top)),
      scrollWidth: scroller?.scrollWidth ?? 0,
      clientWidth: scroller?.clientWidth ?? 0,
      atStart: scroller?.dataset.atStart,
      atEnd: scroller?.dataset.atEnd,
    };
  })()`);
  if (
    narrowPeriods.count !== 3
    || new Set(narrowPeriods.tops).size !== 1
    || narrowPeriods.scrollWidth <= narrowPeriods.clientWidth
    || narrowPeriods.atStart !== 'true'
    || narrowPeriods.atEnd !== 'false'
  ) {
    throw new Error(`Narrow period row regression failed: ${JSON.stringify(narrowPeriods)}`);
  }
  await evaluate(send, `(() => {
    const scroller = document.querySelector('.usage-period-scroll');
    if (!scroller) return false;
    scroller.scrollLeft = scroller.scrollWidth;
    scroller.dispatchEvent(new Event('scroll'));
    return true;
  })()`);
  await waitForExpression(send, `document.querySelector('.usage-period-scroll')?.dataset.atEnd === 'true'`);
  const scrolledEdges = await evaluate(send, `({
    atStart: document.querySelector('.usage-period-scroll')?.dataset.atStart,
    atEnd: document.querySelector('.usage-period-scroll')?.dataset.atEnd,
  })`);
  if (scrolledEdges.atStart !== 'false' || scrolledEdges.atEnd !== 'true') {
    throw new Error(`Narrow fade edge regression failed: ${JSON.stringify(scrolledEdges)}`);
  }
  const narrowOverflows = await collectVisibleOverflow(send);
  if (narrowOverflows.length) {
    throw new Error(`Narrow visible-text overflow: ${JSON.stringify(narrowOverflows)}`);
  }
  await send('Emulation.clearDeviceMetricsOverride');

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
      providerDetails: [...document.querySelectorAll('.usage-hero')].map((hero) => ({
        kicker: hero.querySelector('.usage-hero-kicker')?.textContent?.trim() ?? '',
        main: hero.querySelector('.usage-hero-title')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        ring: hero.querySelector('.usage-ring')?.getAttribute('aria-label') ?? '',
        previous: hero.querySelector('.usage-hero-previous')?.textContent?.trim() ?? '',
      })),
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
    || result.providerDetails.length !== 2
    || result.providerDetails[0]?.kicker !== '本地'
    || !result.providerDetails[0]?.ring.includes('官方额度')
    || result.providerDetails[1]?.kicker !== '本地'
    || /%/.test(result.providerDetails[1]?.main ?? '')
    || result.providerDetails[1]?.previous.includes('上期 0.000M Token')
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
    header: document.querySelector('.workspace-header')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
    summary: [...document.querySelectorAll('.usage-workspace .usage-period-card')]
      .map((node) => node.textContent.replace(/\\s+/g, ' ').trim()),
    modelTitle: document.querySelector('.usage-detail-grid--portfolio .card-label')?.textContent ?? '',
  })`);
  if (
    analysis.providers !== 6
    || !analysis.header.includes('用量与成本')
    || !analysis.header.includes('跨 Provider')
    || !analysis.header.includes('6 个 Provider')
    || !analysis.header.includes('Analytics')
    || analysis.header.includes('比较不同 Provider 的使用贡献与本月成本')
    || analysis.summary.length !== 3
    || !analysis.summary.some((item) => item.includes('本期'))
    || !analysis.summary.some((item) => item.includes('本月'))
    || !analysis.summary.some((item) => item.includes('总计'))
    || !analysis.summary.every((item) => item.includes('估价'))
    || !analysis.modelTitle.includes('本期模型')
  ) {
    throw new Error(`Usage analysis regression failed: ${JSON.stringify(analysis)}`);
  }

  await evaluate(send, `document.querySelector('.usage-workspace [data-period="total"]')?.click()`);
  await waitForExpression(send, `document.querySelector('.provider-analysis-heading')?.textContent?.includes('总计')`);
  const totalPeriod = await evaluate(send, `({
    selected: document.querySelector('.usage-workspace [data-period="total"]')?.getAttribute('aria-selected'),
    modelTitle: document.querySelector('.usage-detail-grid--portfolio .card-label')?.textContent ?? '',
    heading: document.querySelector('.provider-analysis-heading')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
  })`);
  if (
    totalPeriod.selected !== 'true'
    || !totalPeriod.modelTitle.includes('总计模型')
    || !totalPeriod.heading.includes('总计')
  ) {
    throw new Error(`Usage period switch regression failed: ${JSON.stringify(totalPeriod)}`);
  }

  await evaluate(send, `(() => {
    const button = [...document.querySelectorAll('.app-toolbar-nav-item')]
      .find((node) => node.textContent.includes('Providers'));
    button?.click();
    return Boolean(button);
  })()`);
  await waitForExpression(send, 'document.querySelectorAll(".provider-table-row").length >= 6');
  const connections = await evaluate(send, `({
    header: document.querySelector('.workspace-header')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
    rows: document.querySelectorAll('.provider-table-row').length,
    tokenRows: [...document.querySelectorAll('.provider-table-row .provider-table-usage strong')]
      .map((node) => {
        const style = getComputedStyle(node);
        return {
          text: node.textContent?.trim() ?? '',
          title: node.getAttribute('title') ?? '',
          aria: node.getAttribute('aria-label') ?? '',
          fontFamily: style.fontFamily,
          fontVariantNumeric: style.fontVariantNumeric,
        };
      }),
  })`);
  if (
    connections.rows < 6
    || !connections.header.includes('连接状态')
    || !connections.header.includes('Provider 授权与来源')
    || !connections.header.includes('6 个 Provider')
    || !connections.header.includes('Connections')
    || connections.header.includes('查看本地客户端连接、授权状态与数据来源')
    || connections.tokenRows.length < 6
    || connections.tokenRows.some((row) => /k\b/i.test(row.text))
    || !connections.tokenRows.some((row) => row.text === '2.84M' && row.title === '2,840,000 Token' && row.aria === '2,840,000 Token')
    || !connections.tokenRows.some((row) => row.text === '0.000M' && row.title === '0 Token' && row.aria === '0 Token')
    || connections.tokenRows.some(({ fontFamily, fontVariantNumeric }) => /Georgia|Times|(?:^|,\s*)serif(?:,|$)/i.test(fontFamily) || !/lining-nums/.test(fontVariantNumeric) || !/tabular-nums/.test(fontVariantNumeric))
  ) {
    throw new Error(`Providers header regression failed: ${JSON.stringify(connections)}`);
  }

  await evaluate(send, `(() => {
    const button = [...document.querySelectorAll('.app-toolbar-nav-item')]
      .find((node) => node.textContent.includes('用量分析'));
    button?.click();
    return Boolean(button);
  })()`);
  await waitForExpression(send, 'Boolean(document.querySelector(".event-analysis-card"))');
  const eventAnalysis = await evaluate(send, `(() => ({
    dateInputs: document.querySelectorAll('.event-analysis-range input[type="date"]').length,
    emptyState: document.querySelector('.event-analysis-empty strong')?.textContent ?? '',
    loadButton: [...document.querySelectorAll('.event-analysis-empty button')].some((node) => node.textContent?.trim() === '加载所选范围'),
    dailyChart: document.querySelector('.usage-trend-empty')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
    eventBars: document.querySelectorAll('.event-day-column').length,
  }))()`);
  const analyticsOverflows = await collectVisibleOverflow(send);
  if (
    eventAnalysis.dateInputs !== 2
    || eventAnalysis.emptyState !== '事件明细按需读取'
    || !eventAnalysis.loadButton
    || !eventAnalysis.dailyChart.includes('等待时间戳事件')
    || eventAnalysis.eventBars !== 0
    || analyticsOverflows.length
  ) {
    throw new Error(`Event analysis empty-state regression failed: ${JSON.stringify({ eventAnalysis, analyticsOverflows })}`);
  }

  console.log('Browser drag regression passed:', {
    cards: result.cards,
    paletteItem: result.palette[0],
    resetText: result.resetText.replace(/\s+/g, ' ').trim(),
    persisted: result.persisted,
    analysisProviders: analysis.providers,
    providersRows: connections.rows,
    companionAction: companionAfter.actionImage,
    refreshCentered: companionBefore.refreshCentered,
    analyticsEmptyState: eventAnalysis.emptyState,
  });
} finally {
  socket?.close();
  chromium.kill('SIGTERM');
  vite.kill('SIGTERM');
}

async function collectVisibleOverflow(send) {
  return evaluate(send, `(() => {
    const maxDetails = 12;
    const intentionalScroller = (node) => Boolean(node.closest('.usage-period-scroll, [data-overflow-allowed]'));
    const visible = (node) => {
      if (node.closest('[aria-hidden="true"], [hidden]') || intentionalScroller(node)) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
        && rect.width > 0 && rect.height > 0;
    };
    const selector = (node) => {
      if (node.id) return '#' + node.id;
      if (node.classList.length) return '.' + [...node.classList].slice(0, 2).join('.');
      return node.tagName.toLowerCase();
    };
    return [...document.querySelectorAll('.app-shell *')]
      .filter((node) => {
        if (!(node instanceof HTMLElement) || !visible(node)) return false;
        const text = (node.innerText || '').trim();
        return text && (node.childElementCount === 0 || node.matches('button, [role="button"]'));
      })
      .flatMap((node) => {
        const frame = node.closest('.app-toolbar, .workspace-content, .card, .provider-table, .setup-banner, .workspace-companion-message');
        if (!frame || !visible(frame)) return [];
        const rect = node.getBoundingClientRect();
        const frameRect = frame.getBoundingClientRect();
        const horizontalEscape = rect.left < frameRect.left - 1 || rect.right > frameRect.right + 1;
        const style = getComputedStyle(node);
        const deliberateTruncation = style.overflow === 'hidden' && style.textOverflow === 'ellipsis';
        const scrollEscape = node.scrollWidth > node.clientWidth + 1 && !deliberateTruncation;
        if (!horizontalEscape && !scrollEscape) return [];
        return [{
          selector: selector(node),
          text: (node.innerText || '').trim().slice(0, 80),
          rect: { left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) },
          frame: { left: Math.round(frameRect.left), right: Math.round(frameRect.right), width: Math.round(frameRect.width) },
          scroll: { width: node.scrollWidth, clientWidth: node.clientWidth },
        }];
      })
      .slice(0, maxDetails);
  })()`);
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
