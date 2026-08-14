'use client';

import { useTranslations } from 'next-intl';
import { useFollow } from '@/hooks/useFollow';

interface FollowButtonProps {
  targetUserId: string;
  size?: 'sm' | 'md';
}

/**
 * Follow / Following toggle. Tapping "Following" unfollows (2-state toggle).
 * Min hit target ≥44pt via py sizing.
 */
export default function FollowButton({ targetUserId, size = 'md' }: FollowButtonProps) {
  const t = useTranslations();
  const { isFollowing, follow, unfollow, isPending } = useFollow(targetUserId);

  const base = 'rounded-full font-bold active:scale-95 transition-transform disabled:opacity-50';
  const sizing = size === 'sm' ? 'px-4 py-2 text-xs' : 'px-6 py-2.5 text-sm';

  if (isFollowing) {
    return (
      <button
        onClick={unfollow}
        disabled={isPending}
        className={`${base} ${sizing} bg-white text-brand-green border border-brand-green`}
      >
        {t('follow.following')}
      </button>
    );
  }

  return (
    <button
      onClick={follow}
      disabled={isPending}
      className={`${base} ${sizing} bg-brand-green text-white shadow-[0_4px_20px_rgba(37,65,50,0.3)]`}
    >
      {t('follow.follow')}
    </button>
  );
}
