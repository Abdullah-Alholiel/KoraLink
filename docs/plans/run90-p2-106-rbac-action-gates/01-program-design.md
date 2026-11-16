# Run #90 — Program Design (Gates 1–3 compact): P2-106 rbac action gates

## Problem (Gate 1)

Admin console action flags (`can()`) are declared but never used. A user whose role changed
server-side (demoted/banned mid-session) still sees clickable Resolve/Reopen (disputes) and Save
(settings) buttons that 403 on click. Violates the rbac.ts docstring invariant: "users never see
a button that will 403." User story: *As a console operator whose role was changed, I should not
see action buttons my role can no longer perform.*

**IN:** wire `can(role, action)` into disputes/[id] (resolve + reopen blocks) and settings (save
button), using the P2-124 hydration-safe role resolution. **OUT:** new actions/roles, bulk
moderation (P2-107), backend changes (API remains the boundary), route-level changes (layout
already gates), other pages' actions (users/venues/matches already render under route gating +
server 403s; extend later in same pattern if a stale-role 403 is ever observed there).

## Architecture (Gate 2)

No API/schema/i18n changes. Pure client affordance gating:

- `disputes/[id]/page.tsx`: add `useRbacActions()`-style local pattern — `const [role, setRole] =
  useState<Role | null>(null)` + `useEffect(() => setRole(getRole()), [])` (P2-124 pattern; getRole
  reads localStorage/token → must not run during render). Compute `const canResolve =
  can(role, 'dispute.resolve')`, `const canReopen = can(role, 'dispute.reopen')`. Gate the resolve
  action-bar block and the reopen button: hide when not permitted (conditional render — a disabled
  button still advertises the action; hiding matches the invariant).
- `settings/page.tsx`: same role resolution; `canEdit = can(role, 'settings.edit')`; save button
  hidden when !canEdit (inputs stay visible read-only — data browsing remains possible; the WRITE
  affordance is what must vanish).
- While `role === null` (pre-mount, one frame): treat as not-permitted (render nothing / no save
  button) — never flash privileged UI. This is also the SSR-safe render (server renders the same
  not-permitted frame; effect upgrades after mount). No hydration mismatch possible: first client
  render === server render by construction.

## Contracts (Gate 3)

- `can(role: Role | null, action: ConsoleAction): boolean` — existing signature, unchanged.
  Admin → all actions; VenueOwner → pitch/venue/verification subset; Player/null → [].
- No new endpoints, DTOs, i18n keys (hidden buttons need no copy; no error copy — nothing errors).
- TS: pages import `{ getRole, can }` from `@/lib/rbac` + `type Role` from `@/lib/api` (mirrors
  layout.tsx imports).

## Gate 3 contract verification checklist

- [x] Every mutation endpoint touched? **None** — client-only affordance change; API boundary untouched.
- [x] Frontend types accept backend shapes? **Unchanged** — no data-shape edits.
- [x] Adapter functions for consumed shapes? **Unchanged** — no new shapes.
- [x] No field silently undefined? **Unchanged.**
- [x] i18n keys exist for every user-facing string? **No new strings** (gating hides existing
  buttons; visible copy untouched). Parity stays 618/618 (Reviewer A verified pre-run).

## Gate 4 slices

1. Slice 1 (tracer): disputes/[id] resolve+reopen gated by can() — tsc + build green → commit.
2. Slice 2: settings save gated — tsc + build green → commit.
3. Gates: `npx tsc --noEmit -p apps/admin/tsconfig.json` (0) + `npx turbo run build
   --filter=admin --concurrency=1` (exit 0) + full `turbo run build --concurrency=1` at merge
   reconcile + PWA vitest suite untouched-but-green at reconcile.
