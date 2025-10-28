# Analysis: Why Eval() Is Excluded from Browser/Edge Builds

## Root Cause Identified

`Eval()` is intentionally excluded from browser builds due to **CLI-specific dependencies** that don't work in browser/edge environments.

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

## Is This Necessary?

**NO! This is NOT a fundamental limitation.**

Both dependencies are for **CLI user experience only**:
- Progress bars for visual feedback in terminal
- Colored text for error/warning messages

Neither is required for the core `Eval()` functionality.

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

## Recommended Fixes

### Option 1: Make Eval() Edge-Compatible (RECOMMENDED)

Create conditional implementations for CLI features:

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

**Result:**
- ✅ `Eval()` works in all environments
- ✅ No breaking changes for existing users
- ✅ Graceful degradation in edge/browser
- ✅ Can be exported from browser builds
- ✅ Works with Vitest deps.optimizer

### Option 2: Move CLI-Specific Code to Separate Package

Create `@braintrust/cli-eval` for CLI-only features:
- Keep core `Eval()` logic environment-agnostic
- Move progress bars and chalk to separate CLI wrapper
- Export clean `Eval()` from browser builds

### Option 3: Document Current Behavior (Quick Fix)

If keeping current architecture:

**Add runtime check with helpful error:**
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

**Question:** "Is this a limitation/bug on the Braintrust side?"

**Answer:** Yes, this is a **fixable limitation**, not a fundamental requirement.

**The Issue:**
- `Eval()` depends on Node.js CLI libraries (`cli-progress`, `chalk`)
- These are for **user experience only** (progress bars, colored text)
- They're not required for core evaluation logic

**The Fix:**
- Make CLI dependencies optional/conditional
- Provide no-op fallbacks for edge environments
- Export `Eval()` from browser builds

**Impact:**
- Zero breaking changes for existing users
- Enables `Eval()` in Cloudflare Workers, Vercel Edge, Deno Deploy, etc.
- Makes the SDK truly isomorphic
- Solves the Vitest issue completely

## Recommendation

Implement **Option 1** (Make Eval() Edge-Compatible):
- Low implementation effort
- No breaking changes
- Maximum compatibility
- Aligns with "isomorphic" library goal stated in docs

Would you like me to create a PR with the implementation?
