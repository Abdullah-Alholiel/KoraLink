'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Camera } from 'lucide-react';
import { fetcher, clearAuthToken } from '@/lib/fetcher';
import { useAppStore, selectUser } from '@/store/useAppStore';
import { useQueryClient } from '@tanstack/react-query';

/**
 * P2-50 (run #181): player avatar upload.
 *
 * Wraps the avatar visual with a camera badge + hidden file input. The
 * component owns the whole upload lifecycle (offline guard → multipart POST
 * → store/query update → localized toast); the page just renders it in the
 * identity row. Server: POST /users/me/avatar (multipart `file`, flag-gated,
 * 2 MB magic-sniffed) → { avatarUrl }; public serve at GET /media/avatars/*.
 *
 * UX states: idle (badge) · uploading (spinner, input disabled) · offline
 * (localized toast, no request) · error (classified localized toast) ·
 * success (avatar swaps from the updated store + profile refetch).
 */
export default function AvatarUpload({
    avatarUrl,
    fullName,
    size = 84,
}: {
    avatarUrl?: string | null;
    fullName: string;
    size?: number;
}) {
    const t = useTranslations('profile');
    const te = useTranslations('errors');
    const to = useTranslations('common');
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = useState(false);
    const storeUser = useAppStore(selectUser);
    const showToast = useAppStore((s) => s.showToast);
    const queryClient = useQueryClient();

    const avatarInitial = fullName.charAt(0).toUpperCase();

    const pickFile = () => inputRef.current?.click();

    async function onFile(file: File | undefined) {
        if (!file || uploading) return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            showToast(to('offline'), 'error');
            return;
        }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetcher<{ avatarUrl: string }>('/users/me/avatar', {
                method: 'POST',
                body: fd,
            });
            // Store first (instant swap), then refetch the profile query so
            // apiUser (which takes priority in merges) carries the new path.
            if (storeUser) {
                useAppStore.setState({
                    user: { ...storeUser, avatarUrl: res.avatarUrl },
                });
            }
            await queryClient.invalidateQueries({ queryKey: ['user', 'profile'] });
            showToast(t('avatarUpdated'), 'success');
        } catch (err) {
            const status = (err as { status?: number })?.status ?? 0;
            const msg = (err as { message?: string })?.message ?? '';
            if (status === 401) {
                // Session truly expired (fetcher already retried with a
                // fresh token) — mirror the app's 401 self-heal behavior.
                clearAuthToken();
                showToast(te('unauthorized'), 'error');
            } else if (status === 403) {
                showToast(t('avatarFailed'), 'error');
            } else if (status === 400 && /2 MB|exceeds/i.test(msg)) {
                showToast(t('avatarTooLarge'), 'error');
            } else if (status === 400 && /JPEG, PNG or WebP/i.test(msg)) {
                showToast(t('avatarInvalidType'), 'error');
            } else if (status === 413 || /size limit/i.test(msg)) {
                // PR-Agent r4 (run #181): multer aborts pre-handler and the global
                // filter answers 413 "Upload exceeds the size limit." — same
                // user-facing meaning as the 400 branch: the photo is too big.
                showToast(t('avatarTooLarge'), 'error');
            } else if (status === 0) {
                showToast(to('offline'), 'error');
            } else {
                showToast(t('avatarFailed'), 'error');
            }
        } finally {
            setUploading(false);
            // Allow re-selecting the same file: reset the input's value.
            if (inputRef.current) inputRef.current.value = '';
        }
    }

    return (
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
            {avatarUrl ? (
                <div
                    className="h-full w-full overflow-hidden rounded-full border-2 border-white/40"
                    style={{ height: size, width: size }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {/* PR-Agent r1 (run #181): no Date.now() cache-bust — avatar
                        paths are sha256-keyed IMMUTABLE objects (a new photo is a
                        new path), so a re-render must re-use the same URL; the
                        render-path clock also diverged SSR vs hydration. */}
                    <img src={avatarUrl} alt={fullName} className="h-full w-full object-cover" />
                </div>
            ) : (
                <div
                    className="flex items-center justify-center rounded-full border-2 border-white/40 bg-brand-green-deep/60"
                    style={{ height: size, width: size }}
                >
                    <span className="text-3xl font-bold text-white/90">{avatarInitial}</span>
                </div>
            )}

            {/* Camera badge — the upload affordance (a11y: real button, named). */}
            <button
                type="button"
                onClick={pickFile}
                disabled={uploading}
                aria-label={t('avatarChange')}
                aria-busy={uploading}
                className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-white text-brand-green-deep shadow-md transition active:scale-95 disabled:opacity-60"
            >
                {uploading ? (
                    <span
                        aria-hidden
                        className="h-4 w-4 animate-spin rounded-full border-2 border-brand-green-deep border-t-transparent"
                    />
                ) : (
                    <Camera className="h-4 w-4" aria-hidden />
                )}
            </button>
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
            />
        </div>
    );
}
