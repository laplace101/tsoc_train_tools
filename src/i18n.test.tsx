/**
 * @vitest-environment happy-dom
 *
 * 回归测试：界面文案默认应为中文（DEFAULT_LANG = 'cn'），
 * 且各页面在中文模式下不应再出现英文原始文案。
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '@/lib/language';
import { ToastProvider } from '@/components/feedback/Toast';
import { DEFAULT_LANG, t, interpolate } from '@/lib/i18n';
import { Home } from '@/pages/Home';
import { Hardware } from '@/pages/Hardware';
import { Models } from '@/pages/Models';

function renderPage(node: React.ReactElement): string {
  const { container } = render(
    <MemoryRouter>
      <LanguageProvider>
        <ToastProvider>{node}</ToastProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
  return container.textContent ?? '';
}

describe('i18n', () => {
  it('defaults to Chinese', () => {
    expect(DEFAULT_LANG).toBe('cn');
  });

  it('renders the hardware page in Chinese', () => {
    const text = renderPage(<Hardware />);
    expect(text).toContain('硬件');
    expect(text).toContain('显存');
    expect(text).not.toContain('Vendor');
  });

  it('renders the models page in Chinese', () => {
    const text = renderPage(<Models />);
    expect(text).not.toContain('Search models');
  });

  it('renders the calculator page in Chinese', () => {
    const text = renderPage(<Home />);
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain('Batch Size');
  });

  it('interpolates placeholders in the selected language', () => {
    expect(interpolate('users: {n}', { n: 42 })).toBe('users: 42');
    // Unknown placeholders stay literal rather than becoming "undefined".
    expect(interpolate('users: {n} {missing}', { n: 42 })).toBe('users: 42 {missing}');
    // Default language is Chinese, so t() picks the Chinese template.
    expect(t('Hi {name}', '你好 {name}', { name: '小明' })).toBe('你好 小明');
    expect(t('Hi {name}', '你好 {name}')).toBe('你好 {name}');
  });

  it('does not leak untranslated English prose in Chinese mode', () => {
    const text = renderPage(<Home />);
    expect(text).not.toContain('What if?');
    expect(text).not.toContain('Latency:');
  });
});
