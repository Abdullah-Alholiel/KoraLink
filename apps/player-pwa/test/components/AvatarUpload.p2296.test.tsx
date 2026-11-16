import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import AvatarUpload from '@/components/profile/AvatarUpload';
import { useAppStore } from '@/store/useAppStore';
import { fetcher, clearAuthToken } from '@/lib/fetcher';

// P2-296 (run #182): avatar upload client-side hardening tripwires.
// (1) oversized files fail INSTANTLY client-side (no network call — the
//     server's 2 MB MAX_AVATAR_BYTES mirrored in the component);
// (2) a 403 means the upload flag is disabled server-side and gets its OWN
//     localized copy (avatarDisabled) — never the generic avatarFailed;
// (3) a within-limit upload still round-trips successfully.

vi.mock('@/lib/fetcher', () => ({
    fetcher: vi.fn(),
    clearAuthToken: vi.fn(),
}));

const mockedFetcher = vi.mocked(fetcher);
const mockedClearAuthToken = vi.mocked(clearAuthToken);

function renderAvatar() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <NextIntlClientProvider messages={enMessages} locale="en">
                <AvatarUpload avatarUrl={null} fullName="Test Player" />
            </NextIntlClientProvider>
        </QueryClientProvider>,
    );
}

function getInput(): HTMLInputElement {
    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    return input as HTMLInputElement;
}

/** jsdom File with an exact byte size without allocating the buffer. */
function fileOfSize(bytes: number): File {
    const f = new File(['x'], 'photo.png', { type: 'image/png' });
    Object.defineProperty(f, 'size', { value: bytes });
    return f;
}

describe('AvatarUpload — P2-296 client gates', () => {
    let showToast: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        showToast = vi.fn();
        useAppStore.setState({ user: null, isAuthenticated: false, showToast } as never);
    });

    it('rejects a >2 MB file client-side — fetcher never fires, avatarTooLarge toast', async () => {
        const user = userEvent.setup();
        renderAvatar();
        await user.upload(getInput(), fileOfSize(2 * 1024 * 1024 + 1));
        expect(mockedFetcher).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith(enMessages.profile.avatarTooLarge, 'error');
        expect(mockedClearAuthToken).not.toHaveBeenCalled();
    });

    it('maps a 403 (upload flag disabled server-side) to the distinct avatarDisabled copy', async () => {
        const user = userEvent.setup();
        mockedFetcher.mockRejectedValueOnce(
            Object.assign(new Error('Avatar upload is not enabled.'), { status: 403 }),
        );
        renderAvatar();
        await user.upload(getInput(), fileOfSize(1024));
        expect(mockedFetcher).toHaveBeenCalledTimes(1);
        expect(showToast).toHaveBeenCalledWith(enMessages.profile.avatarDisabled, 'error');
        expect(showToast).not.toHaveBeenCalledWith(enMessages.profile.avatarFailed, 'error');
    });

    it('uploads a within-limit file: fetcher POST fires, store swaps, success toast', async () => {
        const user = userEvent.setup();
        mockedFetcher.mockResolvedValueOnce({ avatarUrl: '/media/avatars/u1/k.png' });
        useAppStore.setState({
            user: {
                id: 'u1',
                fullName: 'Test Player',
                avatarUrl: null,
            } as never,
            isAuthenticated: true,
            showToast,
        } as never);
        renderAvatar();
        await user.upload(getInput(), fileOfSize(1024));
        expect(mockedFetcher).toHaveBeenCalledWith('/users/me/avatar', expect.anything());
        expect(useAppStore.getState().user?.avatarUrl).toBe('/media/avatars/u1/k.png');
        expect(showToast).toHaveBeenCalledWith(enMessages.profile.avatarUpdated, 'success');
    });
});
