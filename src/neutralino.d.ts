export {};

declare global {
  const NL_PATH: string | undefined;
  const NL_OS: string | undefined;

  interface Window {
    Neutralino?: NeutralinoApi;
  }

  const Neutralino: NeutralinoApi | undefined;

  interface NeutralinoApi {
    init: () => void;
    app: {
      exit: () => Promise<void>;
    };
    events: {
      on: (event: string, handler: (event: { detail: any }) => void) => Promise<void> | void;
      dispatch?: (event: string, detail?: any) => Promise<void> | void;
    };
    filesystem: {
      readFile: (filename: string, options?: { pos?: number; size?: number }) => Promise<string>;
      writeFile: (filename: string, data: string) => Promise<void>;
      createDirectory: (path: string) => Promise<void>;
      readDirectory: (path: string, options?: { recursive?: boolean }) => Promise<Array<{ entry: string; type: 'FILE' | 'DIRECTORY' }>>;
      getStats: (path: string) => Promise<{ size: number; isFile: boolean; isDirectory: boolean; createdAt: number; modifiedAt: number }>;
    };
    os: {
      execCommand: (command: string, options?: { background?: boolean; stdIn?: string; cwd?: string; envs?: Record<string, string> }) => Promise<{ pid: number; stdOut: string; stdErr: string; exitCode: number }>;
      getPath: (name: string) => Promise<string>;
      showNotification: (title: string, content: string, icon?: 'INFO' | 'WARNING' | 'ERROR' | 'QUESTION') => Promise<void>;
      setTray: (options: { icon: string; menuItems: Array<{ id?: string; text: string; isDisabled?: boolean; isChecked?: boolean }>; useTemplateIcon?: boolean }) => Promise<void>;
    };
    storage: {
      setData: (key: string, data?: string | null) => Promise<void>;
      getData: (key: string) => Promise<string>;
      removeData: (key: string) => Promise<void>;
      getKeys: () => Promise<string[]>;
    };
    window: {
      hide: () => Promise<void>;
      minimize: () => Promise<void>;
      show: () => Promise<void>;
      focus: () => Promise<void>;
      setAlwaysOnTop?: (enabled: boolean) => Promise<void>;
      move?: (x: number, y: number) => Promise<void>;
      setDraggableRegion?: (domId: string) => Promise<void>;
    };
  }
}
