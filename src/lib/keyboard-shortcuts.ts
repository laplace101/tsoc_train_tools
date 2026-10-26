import type { WorkloadMode } from '@/lib/formulas/types';

export interface ShortcutDef {
  keys: string;          // display string e.g. "⌘K"
  description: { en: string; cn: string };
  category: string;
}

/** 快捷键分组的显示名称。key 与 ShortcutDef.category 对应。 */
export const SHORTCUT_CATEGORIES: Record<string, { en: string; cn: string }> = {
  Navigation: { en: 'Navigation', cn: '导航' },
  Modes: { en: 'Modes', cn: '模式' },
  'Go to': { en: 'Go to', cn: '跳转' },
  Actions: { en: 'Actions', cn: '操作' },
};

export const SHORTCUT_DEFS: ShortcutDef[] = [
  { keys: '⌘K',      description: { en: 'Open model search',       cn: '打开模型搜索' },       category: 'Navigation' },
  { keys: '⌘\\',     description: { en: 'Toggle theme',            cn: '切换主题' },           category: 'Navigation' },
  { keys: '⌘↵',      description: { en: 'Copy share URL',          cn: '复制分享链接' },       category: 'Navigation' },
  { keys: '?',        description: { en: 'Show keyboard shortcuts', cn: '显示键盘快捷键' },     category: 'Navigation' },
  { keys: 'Esc',      description: { en: 'Close dialog / drawer',   cn: '关闭弹窗 / 抽屉' },    category: 'Navigation' },
  { keys: 'i',        description: { en: 'Inference mode',          cn: '推理模式' },           category: 'Modes' },
  { keys: 't',        description: { en: 'Train mode',              cn: '训练模式' },           category: 'Modes' },
  { keys: 'r',        description: { en: 'Go to Reverse page',      cn: '跳转到反查页' },       category: 'Go to' },
  { keys: 'c',        description: { en: 'Add config to compare',   cn: '把当前配置加入对比' }, category: 'Actions' },
  { keys: 'g m',      description: { en: 'Go to Models page',       cn: '跳转到模型库页' },     category: 'Go to' },
  { keys: 'g h',      description: { en: 'Go to Hardware page',     cn: '跳转到硬件页' },       category: 'Go to' },
];

const MODE_KEY_MAP: Record<string, WorkloadMode> = {
  i: 'inference',
  t: 'train',
};

interface ShortcutHandlers {
  openModelSearch: () => void;
  toggleTheme: () => void;
  copyShareURL: () => void;
  openShortcutsModal: () => void;
  setMode: (mode: WorkloadMode) => void;
  addCompare: () => void;
  navigate: (path: string) => void;
}

function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName.toLowerCase();
  const role = document.activeElement?.getAttribute('role');
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    role === 'combobox' ||
    (document.activeElement as HTMLElement)?.isContentEditable === true
  );
}

export function registerKeyboardShortcuts(handlers: ShortcutHandlers): () => void {
  let gPressed = false;
  let gTimer: ReturnType<typeof setTimeout> | null = null;

  const handleKeyDown = (e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey;

    // ── ⌘K — open model search ──────────────────────────────────────
    if (meta && e.key === 'k') {
      e.preventDefault();
      // Dispatch a custom event so only the visible ModelPicker responds
      document.dispatchEvent(new CustomEvent('llmcalc:open-model-search'));
      return;
    }

    // ── ⌘\ — toggle theme ───────────────────────────────────────────
    if (meta && e.key === '\\') {
      e.preventDefault();
      handlers.toggleTheme();
      return;
    }

    // ── ⌘Enter — copy share URL ─────────────────────────────────────
    if (meta && e.key === 'Enter') {
      e.preventDefault();
      handlers.copyShareURL();
      return;
    }

    // All remaining shortcuts require no input focused
    if (isInputFocused()) return;

    // ── ? — open shortcuts modal ─────────────────────────────────────
    if (e.key === '?') {
      e.preventDefault();
      handlers.openShortcutsModal();
      return;
    }

    // ── g-sequence navigation ────────────────────────────────────────
    if (e.key === 'g' && !gPressed) {
      gPressed = true;
      if (gTimer) clearTimeout(gTimer);
      gTimer = setTimeout(() => { gPressed = false; }, 1000);
      return;
    }

    if (gPressed) {
      gPressed = false;
      if (gTimer) clearTimeout(gTimer);
      if (e.key === 'm') { e.preventDefault(); handlers.navigate('/models'); return; }
      if (e.key === 'h') { e.preventDefault(); handlers.navigate('/hardware'); return; }
    }

    // ── r — go to Reverse page ───────────────────────────────────────
    if (e.key === 'r') {
      e.preventDefault();
      handlers.navigate('/reverse');
      return;
    }

    // ── Mode switching ───────────────────────────────────────────────
    const mode = MODE_KEY_MAP[e.key];
    if (mode) {
      e.preventDefault();
      handlers.setMode(mode);
      return;
    }

    // ── c — add to compare ───────────────────────────────────────────
    if (e.key === 'c') {
      e.preventDefault();
      handlers.addCompare();
      return;
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => {
    document.removeEventListener('keydown', handleKeyDown);
    if (gTimer) clearTimeout(gTimer);
  };
}
