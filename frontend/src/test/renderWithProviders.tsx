import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom';
import { TranslationsProvider } from '../features/translations/TranslationsContext';

export function renderWithProviders(
  ui: React.ReactElement,
  { initialEntries = ['/'] }: MemoryRouterProps = {},
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <TranslationsProvider>{ui}</TranslationsProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
