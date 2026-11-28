import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { api, ApiError, classifyApiError } from '@/lib/api';
import type { AdminReportDetail } from '@/lib/types';
import ReportDetailPage from '@/app/(dashboard)/reports/[id]/page';

/**
 * P2-410 (run #238) — report-detail a11y residual.
 *  (a) outcome toggle buttons expose aria-pressed and it flips on click;
 *  (b) saveError <p> renders carry role="alert" (re-keyed per failure);
 *  (c) the 30s timeout path throws a typed ApiError(status 0) → 'network'.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useParams: () => ({ id: 'rep-1' }),
}));

const reload = vi.fn();
let report: AdminReportDetail;
vi.mock('@/lib/use-live-data', () => ({
  useLiveAdminData: () => ({ data: report, loading: false, error: null, reload }),
}));

type Msgs = Record<string, Record<string, string>>;
const enM = en as unknown as Msgs;

function makeReport(status: AdminReportDetail['status']): AdminReportDetail {
  return {
    id: 'rep-1-aaaaaaaa',
    subject_type: 'match',
    subject_id: 'm-1',
    reason: 'spam',
    status,
    resolution: status === 'open' ? null : 'done',
    resolved_at: null,
    created_at: '2026-11-01T10:00:00Z',
    reporter_name: null,
    reporter_handle: null,
    subject_label: 'Match',
    reporter: { id: 'u-1', full_name: 'Rep Orter', handle: null, avatar_url: null, phone: null },
    resolvedBy: null,
    subject: { type: 'match', id: 'm-1', label: 'Match', status: 'Open' },
    version: 1,
  };
}

function adminToken(): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64({ role: 'Admin' })}.sig`;
}

function renderPage() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={en}
      onError={(err) => {
        if (err.code !== 'INVALID_KEY') throw err;
      }}
    >
      <ReportDetailPage />
    </NextIntlClientProvider>,
  );
}

function serverError(): Response {
  return new Response(JSON.stringify({ message: 'boom' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  window.localStorage.setItem('koralink_admin_token', adminToken());
  reload.mockClear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('P2-410 report outcome picker a11y', () => {
  it('outcome buttons expose aria-pressed and it flips with the selection', () => {
    report = makeReport('open');
    renderPage();
    const resolveBtn = screen.getByRole('button', { name: enM.adminReports.resolveBtn });
    const dismissBtn = screen.getByRole('button', { name: enM.adminReports.dismissBtn });

    expect(resolveBtn.getAttribute('aria-pressed')).toBe('true');
    expect(dismissBtn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(dismissBtn);
    expect(resolveBtn.getAttribute('aria-pressed')).toBe('false');
    expect(dismissBtn.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(resolveBtn);
    expect(resolveBtn.getAttribute('aria-pressed')).toBe('true');
    expect(dismissBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('resolve-branch save error renders as role="alert" and remounts on a repeated failure', async () => {
    report = makeReport('open');
    vi.stubGlobal('fetch', vi.fn(async () => serverError()));
    renderPage();
    const submit = screen.getByRole('button', { name: enM.adminReports.submit });

    await act(async () => {
      fireEvent.click(submit);
    });
    const first = await screen.findByRole('alert');
    expect(first.tagName).toBe('P');
    expect(first.textContent).toBe(enM.errors.server);

    await act(async () => {
      fireEvent.click(submit);
    });
    const second = await screen.findByRole('alert');
    expect(second.textContent).toBe(enM.errors.server);
    // New key → new DOM node → screen readers re-announce identical copy.
    expect(second).not.toBe(first);
  });

  it('edit-outcome branch save error renders as role="alert"', async () => {
    report = makeReport('resolved');
    vi.stubGlobal('fetch', vi.fn(async () => serverError()));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: enM.adminReports.editOutcome }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: enM.common.saveChanges }));
    });
    const alert = await screen.findByRole('alert');
    expect(alert.tagName).toBe('P');
    expect(alert.textContent).toBe(enM.errors.server);
  });
});

describe('P2-410 apiFetch timeout is a typed network error', () => {
  it('an internal AbortError (no caller signal) throws ApiError status 0 → network bucket', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }),
    );
    const err = await api.get('/admin/reports').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).code).toBeUndefined();
    expect(classifyApiError(err)).toBe('network');
  });

  it('a caller-initiated abort is rethrown untouched (not converted to ApiError)', async () => {
    const ctrl = new AbortController();
    const abortErr = new DOMException('The operation was aborted.', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        ctrl.abort();
        throw abortErr;
      }),
    );
    const err = await api.get('/admin/reports', { signal: ctrl.signal }).catch((e: unknown) => e);
    expect(err).toBe(abortErr);
    expect(err).not.toBeInstanceOf(ApiError);
  });
});
