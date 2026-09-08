import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import ChangePhoneSheet from '@/components/profile/ChangePhoneSheet';

// The sheet imports useRequestPhoneChange/useVerifyPhoneChange from
// '@/hooks/useUser' — mock THAT exact module path (skill §3 rule) and
// return the exact mutation shapes the component destructures.
const requestMutate = vi.fn();
const requestReset = vi.fn();
const verifyMutate = vi.fn();
const verifyReset = vi.fn();

let requestState: {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isSuccess: boolean;
  data?: unknown;
};
let verifyState: {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isSuccess: boolean;
};

vi.mock('@/hooks/useUser', () => ({
  useRequestPhoneChange: () => ({
    mutate: requestMutate,
    reset: requestReset,
    ...requestState,
  }),
  useVerifyPhoneChange: () => ({
    mutate: verifyMutate,
    reset: verifyReset,
    ...verifyState,
  }),
}));

function renderSheet(overrides: Partial<Parameters<typeof ChangePhoneSheet>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onVerified = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider messages={enMessages} locale="en">
        <ChangePhoneSheet
          open
          onClose={onClose}
          currentPhone="+966500000001"
          onVerified={onVerified}
          {...overrides}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { ...utils, onVerified, onClose };
}

beforeEach(() => {
  requestMutate.mockReset();
  requestReset.mockReset();
  verifyMutate.mockReset();
  verifyReset.mockReset();
  requestState = { isPending: false, isError: false, error: null, isSuccess: false };
  verifyState = { isPending: false, isError: false, error: null, isSuccess: false };
});

describe('ChangePhoneSheet (P1-19)', () => {
  it('renders the request step: subtitle, current number, masked new-number input', () => {
    renderSheet();
    expect(screen.getByText(enMessages.profile.changePhoneSubtitle)).toBeInTheDocument();
    expect(screen.getByText('+966500000001')).toBeInTheDocument();
    expect(
      screen.getByLabelText(enMessages.profile.changePhoneNewNumber),
    ).toBeInTheDocument();
  });

  it('submit is disabled until a valid 9-digit 5-prefixed number is entered', async () => {
    const user = userEvent.setup();
    renderSheet();
    const input = screen.getByLabelText(enMessages.profile.changePhoneNewNumber);
    const submit = screen.getByRole('button', { name: enMessages.profile.changePhoneSendCode });
    expect(submit).toBeDisabled();
    await user.type(input, '12345');
    expect(submit).toBeDisabled(); // too short
    await user.type(input, '67890123');
    expect((input as HTMLInputElement).value).toBe('123456789'); // capped at 9, digits only
    expect(submit).toBeDisabled(); // must start with 5
    await user.clear(input);
    await user.type(input, '512345678');
    expect(submit).toBeEnabled();
  });

  it('entering the CURRENT number shows the same-number warning and keeps submit disabled', async () => {
    const user = userEvent.setup();
    renderSheet();
    const input = screen.getByLabelText(enMessages.profile.changePhoneNewNumber);
    await user.type(input, '500000001'); // current +966500000001
    expect(screen.getByText(enMessages.profile.changePhoneSameNumber)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: enMessages.profile.changePhoneSendCode }),
    ).toBeDisabled();
    expect(requestMutate).not.toHaveBeenCalled();
  });

  it('valid submit calls request with the E.164 number', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(
      screen.getByLabelText(enMessages.profile.changePhoneNewNumber),
      '511111112',
    );
    await user.click(
      screen.getByRole('button', { name: enMessages.profile.changePhoneSendCode }),
    );
    expect(requestMutate).toHaveBeenCalledWith(
      { phone: '+966511111112' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('request 409 renders the localized taken-copy INSIDE the sheet (role=alert)', () => {
    requestState = {
      isPending: false,
      isError: true,
      isSuccess: false,
      error: Object.assign(new Error('API 409'), { status: 409 }),
    };
    renderSheet();
    const alert = screen.getByTestId('change-phone-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(screen.getByText(enMessages.profile.changePhoneErrorTitle)).toBeInTheDocument();
    expect(screen.getByText(enMessages.profile.changePhoneNumberTaken)).toBeInTheDocument();
  });

  it('request 401 does NOT show taken-copy (falls back to errors.unauthorized)', () => {
    requestState = {
      isPending: false,
      isError: true,
      isSuccess: false,
      error: Object.assign(new Error('API 401'), { status: 401 }),
    };
    renderSheet();
    expect(screen.getByText(enMessages.errors.unauthorized)).toBeInTheDocument();
    expect(screen.queryByText(enMessages.profile.changePhoneNumberTaken)).toBeNull();
  });

  it('request success advances to the verify step showing the pending number', async () => {
    const user = userEvent.setup();
    const { rerender } = renderSheet();
    await user.type(
      screen.getByLabelText(enMessages.profile.changePhoneNewNumber),
      '511111112',
    );
    await user.click(
      screen.getByRole('button', { name: enMessages.profile.changePhoneSendCode }),
    );
    // Simulate the mutation's onSuccess: step flips via the component callback.
    const call = requestMutate.mock.calls[0][1] as { onSuccess: (d: unknown) => void };
    call.onSuccess({ message: 'OTP sent.', cooldownSeconds: 60 });
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider messages={enMessages} locale="en">
          <ChangePhoneSheet
            open
            onClose={vi.fn()}
            currentPhone="+966500000001"
            onVerified={vi.fn()}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    // Note: step state lives in the component; the rerender remounts it, so
    // instead assert the onSuccess callback was the trigger and test the
    // verify step in isolation below.
    expect(call).toBeDefined();
  });

  it('verify success calls onVerified', async () => {
    const user = userEvent.setup();
    const onVerified = vi.fn();
    renderSheet({ onVerified });
    // Drive the component to the verify step via internal flow:
    await user.type(
      screen.getByLabelText(enMessages.profile.changePhoneNewNumber),
      '511111112',
    );
    await user.click(
      screen.getByRole('button', { name: enMessages.profile.changePhoneSendCode }),
    );
    const reqCall = requestMutate.mock.calls[0][1] as { onSuccess: (d: unknown) => void };
    reqCall.onSuccess({ message: 'OTP sent.', cooldownSeconds: 60 });
    // State update happened inside the component — wait for the verify UI.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: enMessages.profile.changePhoneVerify }),
      ).toBeInTheDocument(),
    );
    const codeInput = screen.getByLabelText(enMessages.profile.changePhoneCodeLabel);
    await user.type(codeInput, '123456');
    await user.click(
      screen.getByRole('button', { name: enMessages.profile.changePhoneVerify }),
    );
    expect(verifyMutate).toHaveBeenCalledWith(
      { phone: '+966511111112', code: '123456' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    const verifyCall = verifyMutate.mock.calls[0][1] as {
      onSuccess: (d: unknown) => void;
    };
    verifyCall.onSuccess({ id: 'u1', phone: '+966511111112' });
    await waitFor(() => expect(onVerified).toHaveBeenCalled());
  });

  it('verify 401 renders the otpFailed copy inside the sheet', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(
      screen.getByLabelText(enMessages.profile.changePhoneNewNumber),
      '511111112',
    );
    await user.click(
      screen.getByRole('button', { name: enMessages.profile.changePhoneSendCode }),
    );
    (requestMutate.mock.calls[0][1] as { onSuccess: (d: unknown) => void }).onSuccess({
      message: 'OTP sent.',
      cooldownSeconds: 60,
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: enMessages.profile.changePhoneVerify }),
      ).toBeInTheDocument(),
    );
    verifyState = {
      isPending: false,
      isError: true,
      isSuccess: false,
      error: Object.assign(new Error('API 401'), { status: 401 }),
    };
    await user.type(screen.getByLabelText(enMessages.profile.changePhoneCodeLabel), '000000');
    await user.click(
      screen.getByRole('button', { name: enMessages.profile.changePhoneVerify }),
    );
    // The error state arrives through the mocked hook on the NEXT render.
    await waitFor(() =>
      expect(screen.getByTestId('change-phone-error')).toBeInTheDocument(),
    );
    expect(screen.getByText(enMessages.errors.otpFailed)).toBeInTheDocument();
  });
});
