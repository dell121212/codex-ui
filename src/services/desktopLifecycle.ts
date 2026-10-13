import type { Settings } from '../types';

export function shouldStartHidden(settings: Pick<Settings, 'start_hidden'>, args: string[]): boolean {
  if (args.includes('--show')) return false;
  return args.includes('--background') || settings.start_hidden;
}

/** Keep window behavior independent of the usage scanner and its refresh cycle. */
export async function initDesktopLifecycle(
  api: NeutralinoApi,
  loadSettings: () => Promise<Settings>,
  setupTray: () => Promise<boolean>,
  refresh: (force: boolean) => void,
  args: string[],
): Promise<void> {
  // Let GTK complete its native first map before hiding from the renderer.
  // Native hidden=true in Neutralino 6.5 leaves GNOME windows unmapped on restore.
  await api.window.hide();
  const trayReady = setupTray();
  let userChangedVisibility = false;
  let windowActions: Promise<void> = Promise.resolve();
  const enqueue = (action: () => Promise<void>) => {
    userChangedVisibility = true;
    const pending = windowActions.then(action);
    // A failed host call must not block the next user's action.
    windowActions = pending.catch(() => {});
    return pending;
  };
  const show = () => enqueue(async () => {
    await api.window.show();
    await api.window.unminimize();
    await api.window.focus();
  });
  const hide = () => enqueue(async () => {
    if (await trayReady) await api.window.hide();
  });
  const report = (work: Promise<unknown>) => {
    void work.catch(error => console.error('Desktop window action failed', error));
  };

  await api.events.on('trayMenuItemClicked', event => {
    const id = (event.detail as { id?: string } | null)?.id;
    if (id === 'show') report(show());
    if (id === 'hide') report(hide());
    if (id === 'refresh') refresh(true);
    if (id === 'quit') report(api.app.exit());
  });
  await api.events.on('trayIconClicked', () => {
    report(show());
    refresh(false);
  });
  await api.events.on('windowClose', () => {
    report((async () => {
      if (await trayReady) await hide();
      else await api.app.exit();
    })());
  });

  const [settings, trayAvailable] = await Promise.all([loadSettings(), trayReady]);
  // A menu click during startup wins over the saved preference.
  if (userChangedVisibility) return;
  if (!trayAvailable || !shouldStartHidden(settings, args)) await show();
}
