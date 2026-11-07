import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * Managed avatar URL contract (P1-71, Strix run-183 HIGH).
 *
 * `users.avatar_url` may ONLY ever hold a managed media path (`/media/avatars/...`)
 * — the same invariant StorageService.isManagedAvatarPath enforces for uploaded
 * avatars (apps/api/src/common/storage/storage.service.ts). Before this guard,
 * PATCH /users/me persisted ANY string (any scheme/host, e.g. metadata:/ or
 * attacker-controlled URLs) — a stored-URL primitive that is SSRF-ready for any
 * future server-side consumer.
 *
 * Legal values:
 *   - null / undefined  → legal (field absent; no-op)
 *   - ''                → legal (explicit avatar clear)
 *   - '/media/avatars/<safe-chars>' → legal (managed path; no '..' traversal)
 * Everything else → rejected.
 *
 * The pure function is the canonical gate (users.service re-checks every write —
 * DTO validation alone can be bypassed by internal call sites); the class-validator
 * constraint below only wires it into UpdateProfileDto for request-level errors.
 */
export function isValidManagedAvatarUrl(url: string | null | undefined): boolean {
  if (url == null) return true; // null or undefined — field not being set
  if (url === '') return true; // explicit clear
  return (
    /^\/media\/avatars\/[A-Za-z0-9/._-]+$/.test(url) && !url.includes('..')
  );
}

@ValidatorConstraint({ name: 'isManagedAvatarUrl', async: false })
export class IsManagedAvatarUrlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isValidManagedAvatarUrl(value as string | null | undefined);
  }

  defaultMessage(args?: ValidationArguments): string {
    return 'avatar_url must be a managed media path under /media/avatars/';
  }
}
