/**
 * P1-41 (run #35) — transactional email copy dictionary.
 *
 * Mail copy lives HERE (server-rendered), not in the PWA i18n catalogs:
 * the API has no next-intl; each template carries its own {en,ar} pair.
 * Layout + details-box labels are shared. Placeholders use {{var}} and are
 * HTML-escaped at render time (see mailer.service.ts renderEmail).
 *
 * Contract (Gate 3): every template key renders in BOTH locales — enforced
 * by mailer.spec.ts iterating the whole dictionary.
 */

export type MailLocale = 'en' | 'ar';

export interface MailCopy {
  subject: string;
  heading: string;
  body: string;
  cta: string;
}

/** 1:1 with the ActivityVerb subset that mirrors to email (plus mail-only keys). */
export type MailTemplateKey =
  // ── via activities.record() choke point (verb → template 1:1) ──
  | 'pom_decided'
  | 'dispute_resolved'
  | 'dispute_rejected'
  | 'wallet_refunded'
  | 'match_cancelled_admin'
  | 'account_suspended'
  | 'account_banned'
  | 'account_unbanned'
  | 'no_show_marked'
  | 'player_removed'
  | 'match_auto_cancelled'
  | 'report_resolved'
  | 'match_rescheduled'
  | 'venue_ownership_added'
  | 'venue_ownership_removed'
  | 'host_underfilled_nudge'
  // ── direct call sites (no activity row exists) ──
  | 'match_reminder' // scheduler, sendMatchStartReminders
  | 'welcome_verify' // setEmail → verification + welcome in one
  | 'email_verify' // re-verification after an address change
  | 'account_deletion'; // PDPL soft-delete confirmation

export const MAIL_TEMPLATES: Record<MailTemplateKey, { en: MailCopy; ar: MailCopy }> = {
  welcome_verify: {
    en: {
      subject: 'Verify your email — welcome to KoraLink',
      heading: 'Welcome to KoraLink ⚽',
      body: 'Confirm this address to get match reminders, refunds and account updates by email. It takes one tap.',
      cta: 'Verify my email',
    },
    ar: {
      subject: 'فعّل بريدك — مرحباً بك في كورا لينك',
      heading: 'مرحباً بك في كورا لينك ⚽',
      body: 'أكّد هذا البريد لتصلك تذكيرات المباريات والمبالغ المستردة وتحديثات الحساب عبر البريد — بنقرة واحدة فقط.',
      cta: 'تفعيل البريد',
    },
  },
  email_verify: {
    en: {
      subject: 'Confirm your email address',
      heading: 'One more tap',
      body: 'Confirm your new email address to keep receiving account emails.',
      cta: 'Verify my email',
    },
    ar: {
      subject: 'أكّد عنوان بريدك',
      heading: 'خطوة أخيرة',
      body: 'أكّد بريدك الجديد للاستمرار في استلام رسائل الحساب.',
      cta: 'تفعيل البريد',
    },
  },
  match_reminder: {
    en: {
      subject: 'Kick-off soon: {{title}}',
      heading: 'Your match starts soon',
      body: 'Kick-off is almost here. Get your kit ready.',
      cta: 'View match',
    },
    ar: {
      subject: 'الانطلاق قريباً: {{title}}',
      heading: 'مباراتك تبدأ قريباً',
      body: 'الانطلاق بعد قليل. جهّز أدواتك.',
      cta: 'عرض المباراة',
    },
  },
  match_rescheduled: {
    en: {
      subject: 'Match rescheduled: {{title}}',
      heading: 'The match was rescheduled',
      body: 'Check the new time before you set off — the details below are up to date.',
      cta: 'View match',
    },
    ar: {
      subject: 'تغيير موعد المباراة: {{title}}',
      heading: 'تم تغيير موعد المباراة',
      body: 'تحقق من الوقت الجديد قبل الانطلاق — التفاصيل أدناه محدثة.',
      cta: 'عرض المباراة',
    },
  },
  match_cancelled_admin: {
    en: {
      subject: 'Match cancelled: {{title}}',
      heading: 'The match was cancelled',
      body: 'This match was cancelled by the organizer. Any affected booking is being handled.',
      cta: 'View match',
    },
    ar: {
      subject: 'إلغاء المباراة: {{title}}',
      heading: 'تم إلغاء المباراة',
      body: 'تم إلغاء هذه المباراة من قبل المنظّم. سيتم التعامل مع أي حجز متأثر.',
      cta: 'عرض المباراة',
    },
  },
  match_auto_cancelled: {
    en: {
      subject: 'Match cancelled — refund issued: {{title}}',
      heading: 'The match didn’t fill up',
      body: 'The match didn’t reach the minimum number of players and was cancelled. Refunds go back to your KoraLink wallet automatically.',
      cta: 'View match',
    },
    ar: {
      subject: 'إلغاء المباراة وإعادة المبلغ: {{title}}',
      heading: 'لم تكتمل المباراة',
      body: 'لم تكتمل المباراة للعدد الأدنى من اللاعبين وتم إلغاؤها. تُعاد المبالغ إلى محفظتك في كورا لينك تلقائياً.',
      cta: 'عرض المباراة',
    },
  },
  pom_decided: {
    en: {
      subject: 'You’re Player of the Match ⚽',
      heading: 'Player of the Match',
      body: 'You were voted Player of the Match — well played!',
      cta: 'View match',
    },
    ar: {
      subject: 'أنت أفضل لاعب في المباراة ⚽',
      heading: 'أفضل لاعب في المباراة',
      body: 'تم اختيارك أفضل لاعب في المباراة — أحسنت!',
      cta: 'عرض المباراة',
    },
  },
  wallet_refunded: {
    en: {
      subject: 'Refund credited to your wallet',
      heading: 'Money back in your wallet',
      body: 'A refund was credited to your KoraLink wallet. Open the app for the details.',
      cta: 'Open wallet',
    },
    ar: {
      subject: 'تم إيداع مبلغ في محفظتك',
      heading: 'المبلغ عاد إلى محفظتك',
      body: 'تم إيداع مبلغ مسترد في محفظتك في كورا لينك. افتح التطبيق للتفاصيل.',
      cta: 'فتح المحفظة',
    },
  },
  dispute_resolved: {
    en: {
      subject: 'Your dispute was resolved',
      heading: 'Dispute resolved',
      body: 'Your dispute was reviewed and resolved. See the outcome in the app.',
      cta: 'Open KoraLink',
    },
    ar: {
      subject: 'تم حسم نزاعك',
      heading: 'تم حسم النزاع',
      body: 'تمت مراجعة النزاع وحسمه. اطّلع على النتيجة في التطبيق.',
      cta: 'فتح التطبيق',
    },
  },
  dispute_rejected: {
    en: {
      subject: 'Update on your dispute',
      heading: 'Dispute reviewed',
      body: 'Your dispute was reviewed and couldn’t be upheld. Details are in the app.',
      cta: 'Open KoraLink',
    },
    ar: {
      subject: 'تحديث بخصوص نزاعك',
      heading: 'تمت مراجعة النزاع',
      body: 'تمت مراجعة النزاع ولم يتم قبوله. التفاصيل في التطبيق.',
      cta: 'فتح التطبيق',
    },
  },
  report_resolved: {
    en: {
      subject: 'Your report was resolved',
      heading: 'Report resolved',
      body: 'Your report was reviewed and resolved. Thank you for keeping the community safe.',
      cta: 'Open KoraLink',
    },
    ar: {
      subject: 'تم حسم بلاغك',
      heading: 'تم حسم البلاغ',
      body: 'تمت مراجعة بلاغك وحسمه. شكراً للمحافظة على مجتمع آمن.',
      cta: 'فتح التطبيق',
    },
  },
  account_suspended: {
    en: {
      subject: 'Your account was suspended',
      heading: 'Account suspended',
      body: 'Your account was temporarily suspended. Details are in the app.',
      cta: 'Open KoraLink',
    },
    ar: {
      subject: 'تم إيقاف حسابك مؤقتاً',
      heading: 'إيقاف مؤقت للحساب',
      body: 'تم إيقاف حسابك مؤقتاً. التفاصيل في التطبيق.',
      cta: 'فتح التطبيق',
    },
  },
  account_banned: {
    en: {
      subject: 'Your account was banned',
      heading: 'Account banned',
      body: 'Your account was permanently banned.',
      cta: 'Open KoraLink',
    },
    ar: {
      subject: 'تم حظر حسابك',
      heading: 'حظر الحساب',
      body: 'تم حظر حسابك نهائياً.',
      cta: 'فتح التطبيق',
    },
  },
  account_unbanned: {
    en: {
      subject: 'Your account is active again',
      heading: 'Welcome back',
      body: 'Good news — your account is active again.',
      cta: 'Open KoraLink',
    },
    ar: {
      subject: 'تم تفعيل حسابك من جديد',
      heading: 'أهلاً بعودتك',
      body: 'خبر سار — تم تفعيل حسابك من جديد.',
      cta: 'فتح التطبيق',
    },
  },
  no_show_marked: {
    en: {
      subject: 'No-show recorded on a match',
      heading: 'You were marked as a no-show',
      body: 'The host marked you as a no-show. No-shows affect your reputation — if this is a mistake you can open a dispute from the app.',
      cta: 'View match',
    },
    ar: {
      subject: 'تم تسجيل غياب في مباراة',
      heading: 'تم تسجيلك كغائب',
      body: 'قام صاحب المباراة بتسجيلك كغائب. الغياب يؤثر على سمعتك — إذا كان هناك خطأ يمكنك فتح نزاع من التطبيق.',
      cta: 'عرض المباراة',
    },
  },
  player_removed: {
    en: {
      subject: 'You were removed from a match',
      heading: 'Removed from the roster',
      body: 'The host removed you from a match roster.',
      cta: 'View match',
    },
    ar: {
      subject: 'تمت إزالتك من مباراة',
      heading: 'إزالة من قائمة اللاعبين',
      body: 'قام صاحب المباراة بإزالتك من قائمة اللاعبين.',
      cta: 'عرض المباراة',
    },
  },
  venue_ownership_added: {
    en: {
      subject: 'A venue was added to your account',
      heading: 'New venue in your partner account',
      body: 'A venue was added to your partner account. Manage pitches and bookings from the partner portal.',
      cta: 'Open partner portal',
    },
    ar: {
      subject: 'تمت إضافة ملعب إلى حسابك',
      heading: 'ملعب جديد في حساب الشريك',
      body: 'تمت إضافة ملعب إلى حسابك كشريك. أدر الملاعب والحجوزات من بوابة الشركاء.',
      cta: 'فتح بوابة الشركاء',
    },
  },
  venue_ownership_removed: {
    en: {
      subject: 'A venue was removed from your account',
      heading: 'Venue removed',
      body: 'A venue was removed from your partner account.',
      cta: 'Open partner portal',
    },
    ar: {
      subject: 'تمت إزالة ملعب من حسابك',
      heading: 'إزالة ملعب',
      body: 'تمت إزالة ملعب من حسابك كشريك.',
      cta: 'فتح بوابة الشركاء',
    },
  },
  host_underfilled_nudge: {
    en: {
      subject: 'Your match needs players',
      heading: 'Your match is still short',
      body: 'Your match is still short of players. Share it with your squad to fill the pitch.',
      cta: 'View match',
    },
    ar: {
      subject: 'مباراتك تحتاج لاعبين',
      heading: 'لا تزال مباراتك تنقصها اللاعبون',
      body: 'لا تزال مباراتك تنقصها بعض اللاعبين. شاركها مع أصحابك لاكتمال الملعب.',
      cta: 'عرض المباراة',
    },
  },
  account_deletion: {
    en: {
      subject: 'Account deletion confirmed',
      heading: 'Your account is scheduled for deletion',
      body: 'Your account is hidden now and will be permanently erased in 30 days. Changed your mind? Restore it from the login screen within 30 days.',
      cta: 'Open KoraLink',
    },
    ar: {
      subject: 'تأكيد حذف الحساب',
      heading: 'تمت جدولة حذف حسابك',
      body: 'حسابك مخفي الآن وسيُحذف نهائياً بعد 30 يوماً. غيّرت رأيك؟ استعد حسابك من شاشة الدخول خلال 30 يوماً.',
      cta: 'فتح التطبيق',
    },
  },
};

/** Details-box labels (locale-aware), rendered as label/value rows under the heading. */
export const MAIL_DETAIL_LABELS: Record<
  MailLocale,
  { match: string; when: string; where: string; amount: string }
> = {
  en: { match: 'Match', when: 'When', where: 'Where', amount: 'Amount' },
  ar: { match: 'المباراة', when: 'الوقت', where: 'المكان', amount: 'المبلغ' },
};

const BRAND_EN = 'KoraLink';
const BRAND_AR = 'كورا لينك';

export function mailFooter(locale: MailLocale): string {
  return locale === 'ar'
    ? `تصلك هذه الرسالة لأن لديك حساباً في ${BRAND_AR}. لإدارة تفضيلات البريد افتح التطبيق.`
    : `You're receiving this because you have a ${BRAND_EN} account. Manage email preferences in the app.`;
}

export function mailBrand(locale: MailLocale): string {
  return locale === 'ar' ? BRAND_AR : BRAND_EN;
}

/** Verbs that mirror to email via the activities.record() choke point. */
export const EMAIL_ACTIVITY_VERBS: ReadonlySet<string> = new Set<MailTemplateKey>([
  'pom_decided',
  'dispute_resolved',
  'dispute_rejected',
  'wallet_refunded',
  'match_cancelled_admin',
  'account_suspended',
  'account_banned',
  'account_unbanned',
  'no_show_marked',
  'player_removed',
  'match_auto_cancelled',
  'report_resolved',
  'match_rescheduled',
  'venue_ownership_added',
  'venue_ownership_removed',
  'host_underfilled_nudge',
]);
