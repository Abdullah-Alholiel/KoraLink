/**
 * P2-8 (run #24): shared catalog for web-push title/body text, per subscriber
 * locale. The backend composes pushes with a semantic key + template vars;
 * sendPushToUsers renders per-subscription using push_subscriptions.locale
 * (P1-5). Locale fallback matches notifications.service.ts: 'ar' → Arabic,
 * anything else → English (never throws on unknown values).
 *
 * Out of scope (deliberate): DM / match-chat message pushes stay locale-neutral
 * (sender name + raw message text — nothing to translate).
 *
 * Single source of truth — no messages/*.json involvement, so the PWA i18n
 * leaf-key parity stays untouched.
 */

export type PushLocale = 'en' | 'ar';

export type PushKey =
  | 'match_starting_soon'
  | 'players_needed'
  | 'players_needed_renudge'
  | 'match_cancelled'
  | 'match_rescheduled'
  | 'player_removed'
  | 'pom_decided'
  | 'report_resolved'
  | 'report_dismissed';

/**
 * Template vars. All stringly/loosely typed on purpose: push text interpolates
 * plain values into short strings. `kickoffISO` must be a full ISO timestamp —
 * the catalog formats it per-locale on the Asia/Riyadh wall clock.
 */
export type PushVars = {
  /** Match title, embedded as-is inside quotes in both locales. */
  title?: string;
  /** Missing-player count for nudge pushes. */
  needed?: number;
  /** POTM winner display name. */
  winnerName?: string;
  /** ISO timestamp of kickoff (match_starting_soon only). */
  kickoffISO?: string;
};

type Entry = { title: string; body: (v: PushVars) => string };

function kickoffTime(iso: string, locale: 'en-GB' | 'ar-SA'): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Riyadh',
    hour12: false,
  }).format(new Date(iso));
}

/**
 * Run #24 Reviewer-A fix: a missing kickoffISO used to fabricate "now" —
 * subscribers saw "kicks off at <current time>". Kick-off is ALWAYS known on
 * the reminder path (matches.service.ts builds it from scheduled_at), so a
 * missing value can only mean a data bug. Return a visibly broken marker
 * (and capture it) instead of lying with the current time.
 */
function kickoffFallback(): string {
  return '--:--';
}

const CATALOG: Record<PushKey, Record<PushLocale, Entry>> = {
  match_starting_soon: {
    en: {
      title: '⏰ Match starting soon',
      body: (v) =>
        `"${v.title ?? ''}" kicks off at ${kickoffTime(
          v.kickoffISO ?? kickoffFallback(),
          'en-GB',
        )} — see you there!`,
    },
    ar: {
      title: '⏰ المباراة تبدأ قريبًا',
      body: (v) =>
        `"${v.title ?? ''}" تبدأ الساعة ${kickoffTime(
          v.kickoffISO ?? kickoffFallback(),
          'ar-SA',
        )} — نراك هناك!`,
    },
  },
  players_needed: {
    en: {
      title: '📣 Players needed',
      body: (v) =>
        `"${v.title ?? ''}" still needs ${v.needed ?? 0} more player${
          v.needed === 1 ? '' : 's'
        } — invite them before kick-off.`,
    },
    ar: {
      title: '📣 لاعبون مطلوبون',
      body: (v) =>
        `لا يزال "${v.title ?? ''}" يحتاج ${v.needed ?? 0} ${
          v.needed === 1 ? 'لاعب إضافي' : 'لاعبين إضافيين'
        } — ادعُهم قبل انطلاق المباراة.`,
    },
  },
  players_needed_renudge: {
    en: {
      title: '📣 Players needed',
      body: (v) =>
        `"${v.title ?? 'Your match'}" dropped to ${v.needed ?? 0} below the minimum after a withdrawal — invite more players.`,
    },
    ar: {
      title: '📣 لاعبون مطلوبون',
      body: (v) =>
        `انخفض "${v.title ?? 'مباراتك'}" إلى ${v.needed ?? 0} عن الحد الأدنى بعد انسحاب لاعب — ادعُ المزيد من اللاعبين.`,
    },
  },
  match_cancelled: {
    en: {
      title: '🚫 Match cancelled',
      body: (v) =>
        `"${v.title ?? ''}" was cancelled — the minimum number of players wasn't reached.`,
    },
    ar: {
      title: '🚫 تم إلغاء المباراة',
      body: (v) => `تم إلغاء "${v.title ?? ''}" — لم يتحقق الحد الأدنى من عدد اللاعبين.`,
    },
  },
  match_rescheduled: {
    en: {
      title: '🕒 Match rescheduled',
      body: (v) =>
        `The host moved "${v.title ?? ''}" to a new time. Check the match for details.`,
    },
    ar: {
      title: '🕒 تم تغيير موعد المباراة',
      body: (v) =>
        `غيّر صاحب المباراة موعد "${v.title ?? ''}" إلى وقت جديد. راجع المباراة للتفاصيل.`,
    },
  },
  player_removed: {
    en: {
      title: '⚠️ Removed from match',
      body: (v) => `The host removed you from "${v.title ?? ''}".`,
    },
    ar: {
      title: '⚠️ تمت إزالتك من المباراة',
      body: (v) => `قام صاحب المباراة بإزالتك من "${v.title ?? ''}".`,
    },
  },
  pom_decided: {
    en: {
      title: '🏆 Player of the Match',
      body: (v) => `${v.winnerName ?? ''} was voted Player of the Match!`,
    },
    ar: {
      title: '🏆 أفضل لاعب في المباراة',
      body: (v) => `تم اختيار ${v.winnerName ?? ''} كأفضل لاعب في المباراة!`,
    },
  },
  report_resolved: {
    en: {
      title: 'Report update',
      body: () => 'Your report was resolved. Thank you for helping keep KoraLink safe.',
    },
    ar: {
      title: 'تحديث البلاغ',
      body: () => 'تم حل بلاغك. شكرًا لمساعدتك في الحفاظ على سلامة كورا لينك.',
    },
  },
  report_dismissed: {
    en: {
      title: 'Report update',
      body: () => 'Your report was reviewed and dismissed.',
    },
    ar: {
      title: 'تحديث البلاغ',
      body: () => 'تمت مراجعة بلاغك واعتُبر غير مؤسس.',
    },
  },
};

/** Mirror of the SW/controller locale fallback: only 'ar' localizes to Arabic. */
export function normalizePushLocale(raw: string | null | undefined): PushLocale {
  return raw === 'ar' ? 'ar' : 'en';
}

/** Render a push's user-facing text for one locale. Total: never throws. */
export function renderPushText(
  key: PushKey,
  vars: PushVars,
  locale: PushLocale,
): { title: string; body: string } {
  const entry = CATALOG[key][locale];
  return { title: entry.title, body: entry.body(vars) };
}
