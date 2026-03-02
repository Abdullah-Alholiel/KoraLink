# TypeScript Configuration Fix Plan

## Issue Analysis

### Detected Problem
- **Error**: Cannot find type definition file for 'mapbox__point-geometry'
- **Context**: Entry point for implicit type library 'mapbox__point-geometry'

### Root Cause
The project has `mapbox-gl` and `react-map-gl` listed as dependencies in [`package.json`](apps/player-pwa/package.json:20-25), but these packages are not actually used anywhere in the codebase. These packages have a transitive dependency on `@mapbox/point-geometry`, and TypeScript is attempting to resolve type definitions for it but failing because:

1. There is no standalone `@types/mapbox__point-geometry` package available
2. The types are bundled within the mapbox packages themselves
3. TypeScript's automatic type resolution is failing to find them

### Evidence
- Searched all `.ts` and `.tsx` files in the project - **no references to mapbox found**
- Dependencies present in [`package.json`](apps/player-pwa/package.json:20-25):
  - `mapbox-gl: ^3.5.1`
  - `react-map-gl: ^7.1.7`

---

## Solutions

### Solution 1: Remove Unused Dependencies (Recommended)

**Why**: Since mapbox is not used anywhere in the codebase, removing these dependencies is the cleanest solution.

**Changes to [`package.json`](apps/player-pwa/package.json)**:
Remove lines 20 and 25:
```json
"mapbox-gl": "^3.5.1",
```
```json
"react-map-gl": "^7.1.7",
```

**Commands to execute**:
```bash
cd apps/player-pwa && npm uninstall mapbox-gl react-map-gl
```

---

### Solution 2: Configure TypeScript to Exclude Problematic Types

**Why**: If you plan to use mapbox in the future, you can configure TypeScript to handle the missing type definitions gracefully.

**Changes to [`tsconfig.json`](apps/player-pwa/tsconfig.json)**:

Add a `types` array to explicitly control which type packages are loaded:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "types": [],  // <-- ADD THIS: Explicitly disable automatic type inclusion
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Alternative** - Add specific types to include:
```json
"types": ["node", "react", "react-dom"]
```

---

### Solution 3: Create Type Declaration File

**Why**: Create a minimal type declaration to suppress the error without affecting functionality.

**Create file**: `apps/player-pwa/src/types/mapbox.d.ts`
```typescript
declare module 'mapbox__point-geometry';
```

---

## Recommendation

**Primary Recommendation**: Use **Solution 1** (Remove unused dependencies)

**Rationale**:
1. Cleanest approach - removes unused code
2. Reduces bundle size
3. Eliminates potential security vulnerabilities from unused packages
4. Prevents future confusion about whether mapbox is being used

**Secondary Recommendation**: If you plan to use mapbox, use **Solution 2** with an explicit `types` array

---

## Additional Observations

### Current [`tsconfig.json`](apps/player-pwa/tsconfig.json) Assessment
The configuration is generally well-structured with:
- ✅ Modern target (ES2022)
- ✅ Strict mode enabled
- ✅ `skipLibCheck: true` (already present)
- ✅ Proper Next.js plugin configuration
- ✅ Path aliases configured correctly

### No Other Issues Detected
The [`tsconfig.json`](apps/player-pwa/tsconfig.json) file is properly configured and follows Next.js best practices. The only issue is the missing type definition for an unused dependency.

---

## Implementation Steps

If choosing **Solution 1**:
1. Update [`package.json`](apps/player-pwa/package.json) to remove mapbox dependencies
2. Run `npm install` to update lockfile
3. Verify TypeScript compiles without errors

If choosing **Solution 2**:
1. Update [`tsconfig.json`](apps/player-pwa/tsconfig.json) with `types` array
2. Restart TypeScript server in VS Code
3. Verify error is resolved
