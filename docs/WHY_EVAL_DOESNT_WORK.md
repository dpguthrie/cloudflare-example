# Why Eval() Doesn't Work with deps.optimizer

## TL;DR

When using `deps.optimizer.ssr.include` to bundle the Braintrust SDK:
- ✅ **Logging SDK works** (`init`, `traced`, `log`, `wrapOpenAI`)
- ❌ **Eval() does NOT work** - function is not exported in bundled output

## Investigation Results

### What We Found

When we inspect the bundled braintrust module in Vitest:

```typescript
import * as Braintrust from 'braintrust';

console.log('Available exports:', Object.keys(Braintrust));
// Output: ['init', 'traced', 'login', 'wrapOpenAI', ... etc]
// Notable: 'Eval' is NOT in the list

console.log('Has Eval?', 'Eval' in Braintrust);
// Output: false

console.log('Eval type:', typeof Braintrust.Eval);
// Output: undefined
```

### Source Files Comparison

**Node.js Export (`dist/index.d.ts`):**
```typescript
export {
  // ...
  braintrust_Eval as Eval,  // ✅ Eval IS exported
  // ...
}
```

**Browser Export (`dist/browser.d.ts`):**
```typescript
export {
  // ...
  // ❌ Eval is NOT exported at all
  // ...
}
```

### Package.json Exports

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",    // Node.js version (has Eval)
      "module": "./dist/index.mjs",
      "require": "./dist/index.js"
    },
    "./browser": {
      "import": "./dist/browser.mjs",  // Browser version (no Eval)
      "module": "./dist/browser.mjs",
      "require": "./dist/browser.js"
    }
  }
}
```

The main `"."` export correctly points to `index.mjs` which contains `Eval`.

## Theories

### Theory 1: Workerd Condition Resolution ❌

**Hypothesis:** Maybe workerd runtime adds a condition that causes it to resolve to browser exports.

**Evidence Against:**
- We set `resolve.conditions: ['import', 'module', 'node', 'default']` explicitly
- `init()` and other functions work fine, and they're from the same file
- If it were resolving to browser.mjs, none of the SDK would work

**Conclusion:** Not the issue.

### Theory 2: Tree-Shaking During Bundling ✅ (Most Likely)

**Hypothesis:** esbuild (used by deps.optimizer) is tree-shaking `Eval` out during the bundling process.

**Evidence For:**
- Only `Eval` is missing, not other exports
- `Eval` might have dependencies or side effects that make it incompatible with workerd
- esbuild aggressively tree-shakes unused/incompatible code

**Possible reasons Eval gets tree-shaken:**
1. **Async dependencies:** `Eval` might import or use modules that don't work in workerd
2. **Node.js-specific APIs:** `Eval` might depend on `node:*` modules indirectly
3. **Process/environment checks:** Code that checks `process.env` or platform-specific features
4. **File system operations:** Eval might need to read local files for data loading

### Theory 3: Conditional Exports in Source Code ✅ (Likely Contributing)

**Hypothesis:** The source code itself might have conditionals that exclude `Eval` in certain environments.

**Evidence For:**
- `Eval` is a high-level convenience function
- It likely has more dependencies than low-level functions like `init()`
- Browser environments typically don't support full evaluation workflows

## Why Logging SDK Works

The Logging SDK (`init`, `traced`, `log`) consists of lower-level primitives that:
- Don't require file system access
- Don't need Node.js-specific child process or OS APIs
- Are designed to work in edge/browser environments
- Have minimal dependencies

## Observation: Eval Not Exported in Browser Build

Looking at the type definitions:
- **index.d.ts** (Node.js): Exports `Eval` ✅
- **browser.d.ts** (Browser): Does NOT export `Eval` ❌

`Eval()` is not exported in browser/edge builds.

## Why This Matters for Cloudflare Workers

Cloudflare Workers use the V8 isolate runtime (similar to browsers), not full Node.js. While `nodejs_compat` adds some Node.js APIs, it's not a complete Node.js environment.

## What Works in This Example Repo

### Option 1: Logging SDK (Recommended for Vitest)

```typescript
// vitest.config.ts
export default defineWorkersConfig({
  resolve: {
    conditions: ['import', 'module', 'node', 'default'],
  },
  test: {
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ['braintrust', 'uuid', '@opentelemetry/api'],
        },
      },
    },
  },
});

// your-test.test.ts - ✅ WORKS!
import { init, traced, wrapOpenAI } from 'braintrust';

const experiment = init({ project: 'my-project', experiment: 'my-exp' });
await experiment.traced(async (span) => {
  // Your test logic
  span.log({ input, output, scores });
});
```

### Option 2: Direct REST API (Also Works)

```typescript
// No SDK dependency - just HTTP calls
const response = await fetch('https://api.braintrust.dev/v1/experiment', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: JSON.stringify({ project_id, name }),
});
```

### Option 3: HTTP Testing for Eval() (Production Code Only)

```typescript
// Production code (src/index.ts) - ✅ WORKS
import { Eval } from 'braintrust';
await Eval('my-experiment', { /* ... */ });

// Test code - Must use HTTP
import { SELF } from 'cloudflare:test';
const response = await SELF.fetch('http://example.com/run-eval');
```

## Conclusion

**What We Observe:**
- `Eval()` is not exported in browser/edge builds
- The `deps.optimizer` bundles the package, but `Eval()` is not available
- Likely due to CLI-specific dependencies (progress bars, terminal colors)

**What Works in This Example:**
- ✅ **Logging SDK** - Works with `deps.optimizer` in Vitest
- ✅ **Direct API** - Works with direct imports in Vitest
- ✅ **Tracing** - Works with `deps.optimizer` in Vitest
- ❌ **Eval()** - Must use HTTP-based tests in Vitest

**Production Note:** All approaches work in production with `nodejs_compat`, including `Eval()`.

See [VITEST_SOLUTION.md](./VITEST_SOLUTION.md) for complete testing guide.
