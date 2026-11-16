/**
 * Minimal Express.Multer.File declaration (P1-38, run #170).
 *
 * The API uploads venue photos via @nestjs/platform-express's FileInterceptor,
 * but @types/multer is not installed (zero-dep posture) — declare the ONE shape
 * the handler consumes instead of adding a devDependency for a single interface.
 * Field docs: https://github.com/expressjs/multer (File object).
 */
declare global {
  namespace Express {
    interface Multer {
      File: {
        /** Field name in the multipart form. */
        fieldname: string;
        /** Client-declared filename — NEVER used for storage paths. */
        originalname: string;
        encoding: string;
        /** Client-declared MIME — verified against magic bytes in StorageService. */
        mimetype: string;
        size: number;
        /** File contents (memory storage — capped at 5 MB by the route). */
        buffer: Buffer;
      };
    }
  }
}

export {};
