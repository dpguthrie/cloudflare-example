# Analysis: Eval() and Browser/Edge Builds

## Observations

`Eval()` is not exported in browser builds. Investigation shows this is related to **CLI-specific dependencies** used in the implementation.

## Source Code Evidence

### Build Configuration

File: `~/repos/braintrust/sdk/js/tsup.config.ts`

Two separate builds:
1. **Node.js build**: `src/index.ts` → exports from `exports-node.ts`
2. **Browser build**: `src/browser.ts` → exports from `exports-browser.ts`

### Export Files

**`src/exports-node.ts` (line 14):**
```typescript
export {
  Eval,  // ✅ Exported
  EvalResult,
  // ... other framework exports
} from "./framework";
```

**`src/exports-browser.ts`:**
```typescript
export { LazyValue } from "./util";
export * from "./logger";
export * from "./functions/invoke";
export * from "./functions/stream";
export * from "./wrappers/oai";
export * from "./exports-types";
// ❌ Does NOT export from "./framework"
// ❌ Therefore, Eval is NOT available
```

## Dependencies Causing the Issue

File: `~/repos/braintrust/sdk/js/src/framework.ts`

### 1. CLI Progress Bars (Node.js-only)

**Import (line 41):**
```typescript
import { BarProgressReporter, ProgressReporter } from "./progress";
```

**Usage in Eval() (line 589):**
```typescript
const progressReporter = options.progress ?? new BarProgressReporter();
```

**Dependency chain:**
- `BarProgressReporter` → `src/progress.ts` (line 27)
- `src/progress.ts` (line 1): `import * as cliProgress from "cli-progress";`
- `cli-progress` is a **Node.js CLI library** for terminal progress bars
- **Does NOT work in browsers or edge runtimes**

### 2. Chalk for Terminal Colors (Node.js-only)

**Import (line 14):**
```typescript
import chalk from "chalk";
```

**Usage (lines 1195-1196):**
```typescript
export const error = chalk.bold.red;
export const warning = chalk.hex("#FFA500");
```

`chalk` is a **Node.js library** for ANSI terminal colors that doesn't work in browsers.

## Analysis of Dependencies

Both dependencies are for **CLI user experience**:
- Progress bars for visual feedback in terminal
- Colored text for error/warning messages

These are not required for core evaluation functionality.

## Comparison: Why Logging SDK Works

The Logging SDK (`init`, `traced`, `log`) is exported from `src/logger.ts` which:
- ✅ Has NO CLI-specific dependencies
- ✅ Uses only web-compatible APIs
- ✅ Is included in BOTH browser and Node.js builds
- ✅ Works perfectly in Cloudflare Workers

## Impact on Cloudflare Workers

### Production (Wrangler Build)
- `Eval()` **WORKS** because wrangler bundles with polyfills
- The CLI dependencies are included in the bundle
- Production deployment succeeds

### Vitest with deps.optimizer
- `deps.optimizer` bundles with esbuild
- esbuild sees the browser export doesn't include `Eval`
- OR esbuild tree-shakes `Eval` due to CLI dependencies
- Result: `Eval` is not available in tests

## Potential Approaches

### Option 1: Make Eval() Edge-Compatible

Conditional implementations for CLI features could enable edge compatibility:

**File: `src/progress.ts`**
```typescript
// Add a no-op reporter for edge environments
export class NoOpProgressReporter implements ProgressReporter {
  public start(_name: string, _total: number) {}
  public stop() {}
  public increment(_name: string) {}
}

// Conditionally use cli-progress
export class BarProgressReporter implements ProgressReporter {
  constructor() {
    // Only import cli-progress if in Node.js environment
    if (typeof process !== 'undefined' && process.versions?.node) {
      const cliProgress = require("cli-progress");
      this.multiBar = new cliProgress.MultiBar(/* ... */);
    } else {
      // Fallback to no-op in edge environments
      console.warn('Progress bars not available in edge environments');
    }
  }
  // ...
}
```

**File: `src/framework.ts`**
```typescript
// Conditional chalk import
let chalk: any;
try {
  chalk = require("chalk");
} catch {
  // Fallback for edge environments
  chalk = {
    bold: { red: (s: string) => s },
    hex: () => (s: string) => s,
  };
}

// In Eval(), default to SimpleProgressReporter in edge environments
const progressReporter = options.progress ??
  (typeof process !== 'undefined' && process.versions?.node
    ? new BarProgressReporter()
    : new SimpleProgressReporter());
```

**Would enable:**
- `Eval()` in all environments
- No breaking changes for existing users
- Graceful degradation in edge/browser
- Export from browser builds
- Work with Vitest deps.optimizer

### Option 2: Separate CLI Package

Alternative architecture:
- Keep core `Eval()` logic environment-agnostic
- Move progress bars and chalk to separate CLI wrapper
- Export clean `Eval()` from browser builds

### Option 3: Document Current Behavior

Alternative: Add runtime check with helpful error:
```typescript
export async function Eval(...) {
  if (typeof process === 'undefined' || !process.versions?.node) {
    throw new Error(
      'Eval() requires a Node.js environment due to CLI dependencies (progress bars, terminal colors). ' +
      'For edge environments like Cloudflare Workers, use the Logging SDK: init() + traced() + log(). ' +
      'See https://www.braintrust.dev/docs/platform/experiments/write#logging-sdk'
    );
  }
  // ... rest of implementation
}
```

**Update package.json exports:**
```json
{
  "exports": {
    ".": {
      "edge-light": "./dist/browser.mjs",
      "worker": "./dist/browser.mjs",
      "browser": "./dist/browser.mjs",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  }
}
```

## Testing the Fix

To verify Option 1 works:

1. Implement conditional imports
2. Add `Eval` to `exports-browser.ts`
3. Test in this repo:
   ```typescript
   // vitest test
   import { Eval } from 'braintrust';

   await Eval('test', {
     data: () => [{ input: '2+2', expected: '4' }],
     task: (input) => '4',
     scores: [(output, expected) => ({ name: 'match', score: 1 })],
   });
   ```

## Summary

**Current State:**
- `Eval()` depends on Node.js CLI libraries (`cli-progress`, `chalk`)
- These are for user experience (progress bars, colored text)
- Not required for core evaluation logic
- Results in `Eval()` not being exported in browser/edge builds

**What Works in This Example Repo:**
- ✅ `Eval()` works in production with `nodejs_compat`
- ✅ Logging SDK works everywhere (production + Vitest with `deps.optimizer`)
- ✅ Direct API works everywhere (production + Vitest)
- ✅ Tracing works everywhere (production + Vitest with `deps.optimizer`)
- ❌ `Eval()` does not work with Vitest direct imports

**Testing Workarounds:**
- Option 1: Use Logging SDK (works with `deps.optimizer`)
- Option 2: Use Direct API (no SDK dependency)
- Option 3: Test `Eval()` via HTTP endpoints

See [VITEST_SOLUTION.md](./VITEST_SOLUTION.md) for complete testing guide.
