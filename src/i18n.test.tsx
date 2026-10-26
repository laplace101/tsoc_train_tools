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
import { DEFAULT_LANG } from '@/lib/i18n';
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
});
