# Graph Report - koralink  (2026-08-18)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2995 nodes · 5152 edges · 213 communities (155 shown, 58 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 173 edges (avg confidence: 0.79)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `18a2761f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- koralink
- matches/matches.service.ts
- HostMatchForm.tsx
- schema.ts
- PartnerController
- useAppStore
- UpdateProfileDto
- fetcher.ts
- admin/venues.service.ts
- use-live-data.ts
- disputes.service.ts
- globalEnv
- admin/users.service.ts
- app.module.ts
- api-adapter.ts
- JwtCookieAuthGuard
- TopupWalletDto
- GetVenuesDto
- match/[id]/page.tsx
- format.ts
- types.ts
- CurrentUser
- useMatches.test.tsx
- AdminSettlementsService
- useConversations.ts
- useAuth.ts
- api.ts
- admin.module.ts
- fetcher
- ListMatchesDto
- MetricsService
- FollowsService
- BottomSheet.tsx
- MatchesService
- matches/matches.controller.ts
- NotificationSheet.tsx
- useLiveAdminData
- devDependencies
- PlatformSettingsService
- dependencies
- useWallet.ts
- index.ts
- pitches.controller.ts
- devDependencies
- settings.controller.ts
- [locale]/layout.tsx
- "public"."users"
- ConversationsController
- package.json
- api/.eslintrc.json
- ListAuditDto
- AppGateway
- compilerOptions
- dependencies
- OtpStoreService
- ActivitiesService
- NotificationsController
- manifest.json
- compilerOptions
- dependencies
- devDependencies
- compilerOptions
- GenerateSlotsDto
- AuthController
- scripts
- slices.ts
- auth.service.ts
- CreateMatchDto
- include
- CompleteProfileDto
- NotificationsService
- PartnerService
- LocationProvider.tsx
- scripts
- 0011_volatile_reaper.sql
- HostMatchForm
- scripts
- GetMatchesDto
- messages/page.tsx
- 0000_daily_dormammu.sql
- partner.controller.ts
- share.ts
- "matches"
- AllExceptionsFilter
- VerifyOtpDto
- ConversationsService
- partner.service.ts
- UpdatePitchDto
- ErrorBoundary
- PomVotingSheet.tsx
- jwt-cookie.strategy.ts
- SendMessageDto
- WalletHistoryDto
- player-pwa/.eslintrc.json
- "public"."geography_columns"
- admin/scripts/sync-standalone.mjs
- disputes/[id]/page.tsx
- MyPitchesPage
- lib
- 0007_rich_leader.sql
- AuthService
- DevLoginDto
- CreatePitchDto
- exclude
- player-pwa/package.json
- player-pwa/scripts/sync-standalone.mjs
- users/[id]/page.tsx
- 0004_add-personal-messages.sql
- nest-cli.json
- SubmitVerificationDto
- "match_reviews"
- seed.ts
- otp-store.service.ts
- admin/instrumentation.ts
- @types/node
- typescript
- "pitch_slots"
- @typescript-eslint/eslint-plugin
- api/package.json
- player-pwa/instrumentation.ts
- player-pwa/next.config.mjs
- offline.tsx
- no-unportaled-overlays.test.ts
- lucide-react
- react-dom
- @sentry/nextjs
- SettingsPage
- SettlementsPage
- eslint
- @typescript-eslint/parser
- not-found.tsx
- i18n.test.ts
- admin/next.config.mjs
- postcss.config.mjs
- admin/tailwind.config.ts
- bull
- cache-manager
- class-transformer
- class-validator
- cookie-parser
- drizzle-orm
- ioredis
- @nestjs/bull
- @nestjs/cache-manager
- @nestjs/common
- @nestjs/config
- @nestjs/core
- @nestjs/jwt
- @nestjs/passport
- nestjs-pino
- @nestjs/platform-socket.io
- @nestjs/swagger
- @nestjs/websockets
- passport
- passport-jwt
- postgres
- rxjs
- @types/web-push
- web-push
- middleware.ts
- tailwindcss-logical.d.ts
- player-pwa/tailwind.config.ts
- dev-bootstrap.sh
- start.sh
- Body
- Controller
- Delete
- Get
- Param
- Patch
- Post
- Put
- Query
- UseGuards
- Inject
- Injectable
- useMessages.ts
- MatchDetailsForm.tsx
- my-games/page.tsx
- admin/src/providers/ObservabilityProvider.tsx
- Get
- useVenues.ts
- ListSettlementsDto
- HealthController
- tasks
- .handleMessage
- outputs
- discussion-adapter.ts
- .submitVerification

## God Nodes (most connected - your core abstractions)
1. `fetcher()` - 56 edges
2. `useAppStore` - 56 edges
3. `CurrentUser` - 48 edges
4. `useLiveAdminData()` - 36 edges
5. `RealtimeService` - 33 edges
6. `MatchesService` - 32 edges
7. `selectUser()` - 29 edges
8. `withTimestamp()` - 26 edges
9. `PartnerService` - 25 edges
10. `MatchesController` - 23 edges

## Surprising Connections (you probably didn't know these)
- `Discussion` --references--> `Match`  [EXTRACTED]
  apps/player-pwa/src/lib/discussion-adapter.ts → apps/player-pwa/src/types/index.ts
- `MatchDetailPage()` --indirect_call--> `selectUser()`  [INFERRED]
  apps/player-pwa/src/app/[locale]/match/[id]/page.tsx → apps/player-pwa/src/store/useAppStore.ts
- `useNotifications()` --calls--> `fetcher()`  [EXTRACTED]
  apps/player-pwa/src/hooks/useFeed.ts → apps/player-pwa/src/lib/fetcher.ts
- `MyGamesPage()` --indirect_call--> `selectUser()`  [INFERRED]
  apps/player-pwa/src/app/[locale]/(main)/my-games/page.tsx → apps/player-pwa/src/store/useAppStore.ts
- `ConversationPage()` --indirect_call--> `selectUser()`  [INFERRED]
  apps/player-pwa/src/app/[locale]/messages/[id]/page.tsx → apps/player-pwa/src/store/useAppStore.ts

## Import Cycles
- None detected.

## Communities (213 total, 58 thin omitted)

### Community 0 - "koralink"
Cohesion: 0.00
Nodes (3): "drizzle"."__drizzle_migrations", "public"."app_settings", "public"."__drizzle_migrations"

### Community 1 - "matches/matches.service.ts"
Cohesion: 0.06
Nodes (39): activities, conversation_participants, conversations, feed_items, follows, match_messages, match_players, match_votes (+31 more)

### Community 2 - "HostMatchForm.tsx"
Cohesion: 0.18
Nodes (12): CostFooter(), CostFooterProps, ModeToggle(), ModeToggleProps, SlotPicker(), SlotPickerProps, Visibility, VisibilityToggle() (+4 more)

### Community 3 - "schema.ts"
Cohesion: 0.04
Nodes (52): activitiesRelations, activityVerbEnum, auditLogsRelations, bookingModeEnum, conversationParticipantsRelations, conversationsRelations, disputeMessagesRelations, disputesRelations (+44 more)

### Community 4 - "PartnerController"
Cohesion: 0.21
Nodes (11): PartnerController, Body, Controller, CurrentUser, Delete, Param, Patch, Post (+3 more)

### Community 5 - "useAppStore"
Cohesion: 0.10
Nodes (27): AMENITY_ICONS, ClubPage(), formatDateLabel(), PlayPage(), AuthBootstrap(), AuthGuard(), BottomNav(), navItems (+19 more)

### Community 6 - "UpdateProfileDto"
Cohesion: 0.07
Nodes (28): ApiPropertyOptional, IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min (+20 more)

### Community 7 - "fetcher.ts"
Cohesion: 0.10
Nodes (32): GlobalError(), i18n, GlobalError(), i18n, PomResultsSheet(), PomResultsSheetProps, PostMatchSection(), PostMatchSectionProps (+24 more)

### Community 8 - "admin/venues.service.ts"
Cohesion: 0.07
Nodes (29): venue_verifications, ListVenuesDto, ApiPropertyOptional, IsIn, IsInt, IsOptional, IsString, Max (+21 more)

### Community 9 - "use-live-data.ts"
Cohesion: 0.11
Nodes (27): AuditPage(), AuditResponse, DisputesPage(), DisputesResponse, MatchesResponse, TERMINAL, KNOWN_SETTINGS, SettingsResponse (+19 more)

### Community 10 - "disputes.service.ts"
Cohesion: 0.07
Nodes (28): dispute_messages, disputes, AdminDisputesController, Body, Controller, Get, Param, Post (+20 more)

### Community 11 - "globalEnv"
Cohesion: 0.17
Nodes (12): NEXT_PUBLIC_API_URL, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_MAPBOX_TOKEN, NEXT_PUBLIC_MOYASAR_KEY, NEXT_PUBLIC_POSTHOG_HOST, NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_SENTRY_DSN, NODE_ENV (+4 more)

### Community 12 - "admin/users.service.ts"
Cohesion: 0.07
Nodes (29): ListUsersDto, ApiPropertyOptional, IsIn, IsInt, IsOptional, IsString, Max, Min (+21 more)

### Community 13 - "app.module.ts"
Cohesion: 0.12
Nodes (21): DatabaseModule, Global, Module, ActivitiesModule, Module, ConversationsModule, Module, FollowsModule (+13 more)

### Community 14 - "api-adapter.ts"
Cohesion: 0.13
Nodes (26): useMatchMessages(), adaptMatchDetail(), adaptNearbyMatch(), adaptTransaction(), adaptWalletBalance(), buildComments(), buildOrganizer(), buildRoster() (+18 more)

### Community 15 - "JwtCookieAuthGuard"
Cohesion: 0.09
Nodes (19): AdminAuthGuard, Injectable, JwtCookieAuthGuard, Injectable, MarkReadDto, ApiPropertyOptional, IsArray, IsBoolean (+11 more)

### Community 16 - "TopupWalletDto"
Cohesion: 0.08
Nodes (26): TopupWalletDto, ApiProperty, ApiPropertyOptional, IsNumber, IsOptional, IsString, Max, MaxLength (+18 more)

### Community 17 - "GetVenuesDto"
Cohesion: 0.08
Nodes (23): GetVenuesDto, ApiPropertyOptional, IsNumber, IsOptional, IsString, Max, Min, Type (+15 more)

### Community 18 - "match/[id]/page.tsx"
Cohesion: 0.14
Nodes (27): MatchDetailPage(), AttendanceBanner(), AttendanceBannerProps, GameDetails(), GameDetailsProps, LocationMap(), LocationMapProps, useMyDispute() (+19 more)

### Community 19 - "format.ts"
Cohesion: 0.18
Nodes (14): ClubsPage(), FILTER_KEYS, FILTER_LABEL_MAP, FilterKey, MatchDateSections(), MatchDateSectionsProps, AppLocale, dateLocale() (+6 more)

### Community 20 - "types.ts"
Cohesion: 0.09
Nodes (18): SlotsResponse, PartnerSettingsPage(), PartnerVenuesPage(), EditPitchSheetProps, EditPitchValues, addDays(), DAYS, fmtTime() (+10 more)

### Community 21 - "CurrentUser"
Cohesion: 0.21
Nodes (17): CurrentUser, MatchesController, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags, Body (+9 more)

### Community 23 - "AdminSettlementsService"
Cohesion: 0.13
Nodes (11): AdminSettlementsController, Controller, Get, Param, Post, Query, Req, UseGuards (+3 more)

### Community 24 - "useConversations.ts"
Cohesion: 0.10
Nodes (23): ConversationPage(), BadgeHydrator(), MobileFrame(), MobileFrameProps, PaymentSheet(), PaymentSheetProps, ConversationApi, ConversationsApiResponse (+15 more)

### Community 25 - "useAuth.ts"
Cohesion: 0.09
Nodes (22): CompleteProfilePage(), LoginPage(), VerifyContent(), DevLoginBar(), CompleteProfileInput, CompleteProfileResponse, completeProfileSchema, OtpInput (+14 more)

### Community 26 - "api.ts"
Cohesion: 0.14
Nodes (23): DashboardLayout(), LoginPage(), handleDevLogin(), handleVerifyOtp(), SECTION_META, Sidebar(), logout(), apiFetch() (+15 more)

### Community 27 - "admin.module.ts"
Cohesion: 0.07
Nodes (30): audit_logs, settlements, AdminModule, Module, AuditEntry, AuditService, DB, Inject (+22 more)

### Community 28 - "fetcher"
Cohesion: 0.09
Nodes (28): PersonalInfoPage(), POSITIONS, SKILL_LEVELS, MenuItemProps, ProfilePage(), FollowButton(), FollowButtonProps, PlayerProfileSheet() (+20 more)

### Community 29 - "ListMatchesDto"
Cohesion: 0.09
Nodes (19): ListMatchesDto, ApiPropertyOptional, IsEnum, IsInt, IsOptional, Max, Min, Type (+11 more)

### Community 30 - "MetricsService"
Cohesion: 0.14
Nodes (10): MetricsController, Controller, Get, UseGuards, AdminMetrics, DB, MetricsService, Row (+2 more)

### Community 31 - "FollowsService"
Cohesion: 0.12
Nodes (15): FollowsController, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags, Controller, Delete, Get (+7 more)

### Community 32 - "BottomSheet.tsx"
Cohesion: 0.07
Nodes (24): PublishWarningSheet(), PublishWarningSheetProps, BottomSheet(), BottomSheetProps, AppealSheet(), AppealSheetProps, CancelMatchSheet(), CancelMatchSheetProps (+16 more)

### Community 33 - "MatchesService"
Cohesion: 0.16
Nodes (4): withTimestamp(), MatchesService, round2(), Injectable

### Community 34 - "matches/matches.controller.ts"
Cohesion: 0.09
Nodes (21): CastVoteDto, ApiProperty, IsString, CreateDisputeDto, ApiPropertyOptional, IsEnum, IsOptional, IsString (+13 more)

### Community 35 - "NotificationSheet.tsx"
Cohesion: 0.10
Nodes (23): CommunityFeedPage(), ActivityCard(), ActivityCardProps, VERB_ICON, VERB_LABEL, PullToRefresh(), PullToRefreshProps, NotificationBell() (+15 more)

### Community 36 - "useLiveAdminData"
Cohesion: 0.19
Nodes (15): DashboardPage(), MatchesPage(), PartnerEarningsPage(), PartnerDashboardPage(), TransactionsPage(), VenueDetailPage(), VenuesPage(), MetricCard() (+7 more)

### Community 37 - "devDependencies"
Cohesion: 0.08
Nodes (25): devDependencies, drizzle-kit, jest, @nestjs/cli, @nestjs/schematics, @nestjs/testing, ts-jest, ts-loader (+17 more)

### Community 38 - "PlatformSettingsService"
Cohesion: 0.11
Nodes (15): app_settings, DB, DB, PlatformSettingsService, Inject, Injectable, PublicSettingsController, ApiOkResponse (+7 more)

### Community 39 - "dependencies"
Cohesion: 0.08
Nodes (25): dependencies, clsx, @ducanh2912/next-pwa, @hookform/resolvers, next, next-intl, react, react-hook-form (+17 more)

### Community 40 - "useWallet.ts"
Cohesion: 0.23
Nodes (10): getTransactionIcon(), groupTransactionsByDay(), WalletPage(), useTopupWallet(), useWalletBalance(), useWalletHistory(), adaptTransactionList(), TransactionApi (+2 more)

### Community 41 - "index.ts"
Cohesion: 0.12
Nodes (14): AttendanceSheet(), AttendanceSheetProps, PlayerProfileSheetProps, TeamLineup(), TeamLineupProps, TeamLineupSheetProps, Comment, DateOption (+6 more)

### Community 42 - "pitches.controller.ts"
Cohesion: 0.09
Nodes (18): pitch_slots, GetSlotsDto, ApiProperty, IsISO8601, PitchesController, ApiCookieAuth, ApiOkResponse, ApiOperation (+10 more)

### Community 43 - "devDependencies"
Cohesion: 0.09
Nodes (23): devDependencies, eslint-config-next, husky, jsdom, lint-staged, postcss, tailwindcss-logical, @testing-library/jest-dom (+15 more)

### Community 44 - "settings.controller.ts"
Cohesion: 0.11
Nodes (13): ApiProperty, UpdateSettingDto, AdminSettingsController, Body, Controller, Get, Param, Put (+5 more)

### Community 45 - "[locale]/layout.tsx"
Cohesion: 0.15
Nodes (11): locales, outfit, tajawal, viewport, ChunkLoadErrorHandler(), ServiceWorkerUpdater(), IntlClientProvider(), IntlClientProviderProps (+3 more)

### Community 46 - ""public"."users""
Cohesion: 0.14
Nodes (22): "public"."activities", "public"."audit_logs", "public"."conversation_participants", "public"."conversations", "public"."dispute_messages", "public"."disputes", "public"."feed_items", "public"."follows" (+14 more)

### Community 47 - "ConversationsController"
Cohesion: 0.15
Nodes (14): ConversationsController, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags, Body, Controller (+6 more)

### Community 48 - "package.json"
Cohesion: 0.10
Nodes (19): devDependencies, pino-pretty, prettier, turbo, engines, node, turbo, name (+11 more)

### Community 49 - "api/.eslintrc.json"
Cohesion: 0.11
Nodes (17): env, jest, node, extends, ignorePatterns, parser, parserOptions, project (+9 more)

### Community 50 - "ListAuditDto"
Cohesion: 0.12
Nodes (15): AdminAuditController, DB, Controller, Get, Inject, Query, UseGuards, ListAuditDto (+7 more)

### Community 51 - "AppGateway"
Cohesion: 0.18
Nodes (4): AppGateway, Inject, WebSocketGateway, WebSocketServer

### Community 52 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, experimentalDecorators, forceConsistentCasingInFileNames, incremental (+10 more)

### Community 53 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, axios, cache-manager-redis-store, helmet, @nestjs/platform-express, @nestjs/throttler, pino-http, reflect-metadata (+9 more)

### Community 54 - "OtpStoreService"
Cohesion: 0.18
Nodes (3): OtpStoreService, Inject, Injectable

### Community 55 - "ActivitiesService"
Cohesion: 0.12
Nodes (15): ActivitiesController, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags, Body, Controller, Get (+7 more)

### Community 56 - "NotificationsController"
Cohesion: 0.15
Nodes (11): NotificationsController, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags, Body, Controller, Delete (+3 more)

### Community 57 - "manifest.json"
Cohesion: 0.12
Nodes (15): background_color, categories, description, dir, display, icons, lang, name (+7 more)

### Community 58 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, module, moduleResolution (+8 more)

### Community 59 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, clsx, next, posthog-js, react, recharts, tailwind-merge, clsx (+7 more)

### Community 60 - "devDependencies"
Cohesion: 0.13
Nodes (15): devDependencies, autoprefixer, postcss, tailwindcss, @types/react, @types/react-dom, autoprefixer, postcss (+7 more)

### Community 61 - "compilerOptions"
Cohesion: 0.13
Nodes (15): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, module, moduleResolution (+7 more)

### Community 62 - "GenerateSlotsDto"
Cohesion: 0.17
Nodes (14): CreateSlotDto, DAY_VALUES, GenerateSlotsDto, ApiProperty, ApiPropertyOptional, IsArray, IsIn, IsInt (+6 more)

### Community 63 - "AuthController"
Cohesion: 0.25
Nodes (10): ApiBadRequestResponse, AuthController, ApiOkResponse, ApiOperation, ApiTags, Body, Controller, HttpCode (+2 more)

### Community 64 - "scripts"
Cohesion: 0.14
Nodes (14): scripts, build, build-deploy, db:enable-postgis, db:generate, db:migrate, db:seed, db:setup (+6 more)

### Community 65 - "slices.ts"
Cohesion: 0.16
Nodes (15): AuthSlice, createAuthSlice(), createMatchSlice(), createUISlice(), createWalletSlice(), defaultFilters, MatchFilters, MatchSlice (+7 more)

### Community 66 - "auth.service.ts"
Cohesion: 0.24
Nodes (6): AuthModule, Module, DB, SURFACE_ROLES, Injectable, UnifonicService

### Community 67 - "CreateMatchDto"
Cohesion: 0.14
Nodes (13): CreateMatchDto, ApiProperty, ApiPropertyOptional, IsEnum, IsInt, IsISO8601, IsNumber, IsOptional (+5 more)

### Community 68 - "include"
Cohesion: 0.18
Nodes (11): exclude, include, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts, **/*.tsx, exclude (+3 more)

### Community 69 - "CompleteProfileDto"
Cohesion: 0.17
Nodes (10): ApiCookieAuth, Patch, UseGuards, CompleteProfileDto, SkillLevel, ApiPropertyOptional, IsEnum, IsOptional (+2 more)

### Community 70 - "NotificationsService"
Cohesion: 0.20
Nodes (5): Inject, Inject, NotificationsService, Inject, Injectable

### Community 71 - "PartnerService"
Cohesion: 0.24
Nodes (3): PartnerService, Inject, Injectable

### Community 72 - "LocationProvider.tsx"
Cohesion: 0.29
Nodes (10): GeoCoords, GeolocationState, GeoStatus, isSupported(), NOTE: geolocation requires a secure context (HTTPS or localhost). On plain, readCache(), useGeolocation(), writeCache() (+2 more)

### Community 73 - "scripts"
Cohesion: 0.17
Nodes (11): name, private, scripts, build, build-deploy, dev, postbuild, restart (+3 more)

### Community 74 - "0011_volatile_reaper.sql"
Cohesion: 0.24
Nodes (11): "app_settings", "audit_logs", "dispute_messages", "disputes", "reports", "settlements", "public"."matches", "public"."users" (+3 more)

### Community 75 - "HostMatchForm"
Cohesion: 0.17
Nodes (11): HostMatchForm(), parseHostDateParam(), pitchCostForDuration(), PLATFORM_MARGIN_SAR, pricePerPlayer(), riyadhISO(), round2(), classifyPublishError() (+3 more)

### Community 76 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, build, build-deploy, dev, lint, postbuild, prepare, restart (+4 more)

### Community 77 - "GetMatchesDto"
Cohesion: 0.18
Nodes (9): GetMatchesDto, ApiPropertyOptional, IsIn, IsNumber, IsOptional, IsString, Max, Min (+1 more)

### Community 78 - "messages/page.tsx"
Cohesion: 0.31
Nodes (9): groupDiscussions(), MessagesPage(), DiscussionCard(), DiscussionCardProps, formatTime(), STATUS_STYLES, truncateMessage(), useDiscussions() (+1 more)

### Community 79 - "0000_daily_dormammu.sql"
Cohesion: 0.29
Nodes (9): "match_messages", "match_players", "pitches", "public"."matches", "public"."users", "public"."venues", "transactions", "users" (+1 more)

### Community 80 - "partner.controller.ts"
Cohesion: 0.29
Nodes (5): Role, Roles(), ROLES_KEY, RolesGuard, Injectable

### Community 81 - "share.ts"
Cohesion: 0.29
Nodes (5): copyToClipboard(), isDismissal(), shareOrCopy(), ShareOutcome, SharePayload

### Community 82 - ""matches""
Cohesion: 0.22
Nodes (8): "matches", "public"."pitches", "match_votes", "public"."matches", "public"."pitches", "public"."users", "public"."users", "public"."pitch_slots"

### Community 83 - "AllExceptionsFilter"
Cohesion: 0.25
Nodes (4): AppModule, Module, AllExceptionsFilter, Catch

### Community 84 - "VerifyOtpDto"
Cohesion: 0.22
Nodes (8): ApiProperty, ApiPropertyOptional, IsIn, IsOptional, IsPhoneNumber, IsString, VerifyOtpDto, Length

### Community 86 - "partner.service.ts"
Cohesion: 0.25
Nodes (7): CreateVenueDto, ApiProperty, IsString, MaxLength, MinLength, DB, UPCOMING_STATUSES

### Community 87 - "UpdatePitchDto"
Cohesion: 0.22
Nodes (8): ApiPropertyOptional, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min, UpdatePitchDto

### Community 88 - "ErrorBoundary"
Cohesion: 0.22
Nodes (3): ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState

### Community 89 - "PomVotingSheet.tsx"
Cohesion: 0.36
Nodes (6): Portal(), PomConfirmModal(), PomConfirmModalProps, PomVotingSheet(), PomVotingSheetProps, PomCandidate

### Community 90 - "jwt-cookie.strategy.ts"
Cohesion: 0.29
Nodes (5): AuthenticatedUser, JwtCookieStrategy, JwtPayload, Inject, Injectable

### Community 91 - "SendMessageDto"
Cohesion: 0.25
Nodes (7): SendMessageDto, ApiProperty, ApiPropertyOptional, IsNotEmpty, IsOptional, IsString, MaxLength

### Community 92 - "WalletHistoryDto"
Cohesion: 0.25
Nodes (7): ApiPropertyOptional, IsInt, IsOptional, Max, Min, Type, WalletHistoryDto

### Community 93 - "player-pwa/.eslintrc.json"
Cohesion: 0.25
Nodes (7): extends, plugins, rules, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, next/core-web-vitals, @typescript-eslint

### Community 94 - ""public"."geography_columns""
Cohesion: 0.32
Nodes (8): pg_attribute, pg_class, pg_namespace, pg_type, "public"."geography_columns", "public"."geometry_columns", "public"."spatial_ref_sys", "public"."updategeometrysrid"()

### Community 95 - "admin/scripts/sync-standalone.mjs"
Cohesion: 0.29
Nodes (6): adminDir, publicDest, publicSrc, standaloneDir, staticDest, staticSrc

### Community 96 - "disputes/[id]/page.tsx"
Cohesion: 0.33
Nodes (5): DisputeDetail, DisputeDetailPage(), EVIDENCE_LABELS, EvidenceEntry, parseEvidence()

### Community 98 - "lib"
Cohesion: 0.29
Nodes (7): lib, dom, dom.iterable, esnext, lib, dom, esnext

### Community 99 - "0007_rich_leader.sql"
Cohesion: 0.38
Nodes (6): "activities", "feed_items", "follows", "public"."matches", "public"."users", "public"."activities"

### Community 100 - "AuthService"
Cohesion: 0.29
Nodes (4): assertSurfaceRole(), AuthService, Inject, Injectable

### Community 101 - "DevLoginDto"
Cohesion: 0.29
Nodes (6): DevLoginDto, ApiProperty, ApiPropertyOptional, IsIn, IsOptional, IsPhoneNumber

### Community 102 - "CreatePitchDto"
Cohesion: 0.29
Nodes (6): CreatePitchDto, ApiProperty, IsIn, IsNumber, IsString, Min

### Community 103 - "exclude"
Cohesion: 0.29
Nodes (6): exclude, extends, dist, **/*spec.ts, test, ./tsconfig.json

### Community 104 - "player-pwa/package.json"
Cohesion: 0.29
Nodes (6): lint-staged, *.{ts,tsx}, name, private, version, eslint --fix --max-warnings 0

### Community 105 - "player-pwa/scripts/sync-standalone.mjs"
Cohesion: 0.29
Nodes (6): publicDest, publicSrc, pwaDir, standaloneDir, staticDest, staticSrc

### Community 106 - "users/[id]/page.tsx"
Cohesion: 0.40
Nodes (4): ROLES, UserDetailPage(), userStatus(), AdminUser

### Community 107 - "0004_add-personal-messages.sql"
Cohesion: 0.47
Nodes (5): "conversation_participants", "conversations", "personal_messages", "public"."users", "public"."conversations"

### Community 108 - "nest-cli.json"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 109 - "SubmitVerificationDto"
Cohesion: 0.33
Nodes (5): SubmitVerificationDto, ApiProperty, ApiPropertyOptional, IsOptional, IsString

### Community 110 - ""match_reviews""
Cohesion: 0.50
Nodes (4): "match_reviews", "push_subscriptions", "public"."matches", "public"."users"

### Community 111 - "seed.ts"
Cohesion: 0.50
Nodes (4): db, point(), pool, seed()

### Community 114 - "@types/node"
Cohesion: 0.50
Nodes (4): @types/node, @types/node, @types/node, @types/node

### Community 115 - "typescript"
Cohesion: 0.50
Nodes (4): typescript, typescript, typescript, typescript

### Community 116 - ""pitch_slots""
Cohesion: 0.50
Nodes (3): "pitch_slots", "public"."matches", "public"."pitches"

### Community 117 - "@typescript-eslint/eslint-plugin"
Cohesion: 0.50
Nodes (4): plugins, @typescript-eslint/eslint-plugin, @typescript-eslint/eslint-plugin, @typescript-eslint/eslint-plugin

### Community 118 - "api/package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 120 - "player-pwa/next.config.mjs"
Cohesion: 0.50
Nodes (3): nextConfig, withNextIntl, withPWA

### Community 123 - "lucide-react"
Cohesion: 0.67
Nodes (3): lucide-react, lucide-react, lucide-react

### Community 124 - "react-dom"
Cohesion: 0.67
Nodes (3): react-dom, react-dom, react-dom

### Community 125 - "@sentry/nextjs"
Cohesion: 0.67
Nodes (3): @sentry/nextjs, @sentry/nextjs, @sentry/nextjs

### Community 128 - "eslint"
Cohesion: 0.67
Nodes (3): eslint, eslint, eslint

### Community 129 - "@typescript-eslint/parser"
Cohesion: 0.67
Nodes (3): @typescript-eslint/parser, @typescript-eslint/parser, @typescript-eslint/parser

### Community 200 - "useMessages.ts"
Cohesion: 0.18
Nodes (11): ChatSheet(), ChatSheetProps, getDateGroup(), groupMessages(), MatchMessage, mergeMessages(), MyJoinedMatch, useMatchChat() (+3 more)

### Community 201 - "MatchDetailsForm.tsx"
Cohesion: 0.18
Nodes (12): Format, FORMAT_OPTIONS, GENDER_I18N_MAP, GENDER_OPTIONS, GenderRule, MATCH_TYPE_I18N_MAP, MATCH_TYPES, MatchDetailsForm() (+4 more)

### Community 202 - "my-games/page.tsx"
Cohesion: 0.28
Nodes (9): isVotingOpen(), MyGamesPage(), MatchCard(), MatchCardProps, useMyMatches(), adaptMatchList(), isPotmVotingOpen(), Match (+1 more)

### Community 203 - "admin/src/providers/ObservabilityProvider.tsx"
Cohesion: 0.22
Nodes (4): metadata, initPostHog(), ObservabilityProvider(), PostHog

### Community 205 - "useVenues.ts"
Cohesion: 0.31
Nodes (8): PitchSelector(), PitchSelectorProps, VenuePickerSheet(), VenuePickerSheetProps, PitchApi, useVenues(), VenueApi, VenueDetailApi

### Community 206 - "ListSettlementsDto"
Cohesion: 0.22
Nodes (8): ListSettlementsDto, ApiPropertyOptional, IsIn, IsInt, IsOptional, Max, Min, Type

### Community 207 - "HealthController"
Cohesion: 0.22
Nodes (7): HealthController, ApiOperation, ApiTags, Controller, Get, HealthModule, Module

### Community 208 - "tasks"
Cohesion: 0.22
Nodes (8): ^lint, cache, persistent, dependsOn, $schema, tasks, dev, lint

### Community 209 - ".handleMessage"
Cohesion: 0.46
Nodes (3): ConnectedSocket, MessageBody, SubscribeMessage

### Community 210 - "outputs"
Cohesion: 0.29
Nodes (7): ^build, .next/**, !.next/cache/**, dependsOn, outputs, dist/**, build

### Community 211 - "discussion-adapter.ts"
Cohesion: 0.40
Nodes (5): adaptDiscussion(), adaptDiscussionList(), Discussion, DiscussionApi, DiscussionsApiResponse

## Knowledge Gaps
- **518 isolated node(s):** `Conversation`, `ConversationParticipantView`, `ConversationSummary`, `DB`, `PersonalMessage` (+513 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **58 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CurrentUser` connect `CurrentUser` to `matches/matches.controller.ts`, `CompleteProfileDto`, `UpdateProfileDto`, `ConversationsController`, `JwtCookieAuthGuard`, `partner.controller.ts`, `TopupWalletDto`, `ActivitiesService`, `NotificationsController`, `FollowsService`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `RealtimeService` connect `matches/matches.service.ts` to `PlatformSettingsService`, `NotificationsService`, `admin/venues.service.ts`, `PartnerService`, `disputes.service.ts`, `settings.controller.ts`, `admin/users.service.ts`, `app.module.ts`, `AppGateway`, `AdminSettlementsService`, `partner.service.ts`, `ActivitiesService`, `admin.module.ts`, `ListMatchesDto`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `MatchesService` connect `MatchesService` to `matches/matches.service.ts`, `matches/matches.controller.ts`, `NotificationsService`, `pitches.controller.ts`, `app.module.ts`, `GetMatchesDto`, `ListMatchesDto`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `Conversation`, `ConversationParticipantView`, `ConversationSummary` to the rest of the system?**
  _518 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `koralink` be split into smaller, more focused modules?**
  _Cohesion score 0.003780718336483932 - nodes in this community are weakly interconnected._
- **Should `matches/matches.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05723905723905724 - nodes in this community are weakly interconnected._
- **Should `schema.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.03961038961038961 - nodes in this community are weakly interconnected._