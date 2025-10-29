# Testing

Integration tests for Braintrust SDK on Cloudflare Workers with Vitest.

## Quick Start

```bash
# Run all tests
npm test
```

## Testing Approaches

### ✅ Direct Imports (RECOMMENDED)

With `deps.optimizer` configuration, you can directly import and test most Braintrust SDK functions!

**What Works:**
- ✅ **Logging SDK** (`init`, `traced`, `log`, `wrapOpenAI`, `initLogger`)
- ✅ **Tracing** (`initLogger`, `wrapTraced`)
- ✅ **Direct API** (pure REST API calls)

**What Doesn't:**
- ❌ **Eval()** - Node.js only, not exported in browser/edge build

### Configuration: deps.optimizer

The `deps.optimizer.ssr.include` setting in `vitest.config.ts` bundles the Braintrust SDK with esbuild, making it work in the Cloudflare Workers test environment.

```typescript
// vitest.config.ts
export default defineWorkersConfig({
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
```

## Test Structure

```
test/
├── integration/
│   ├── vitest.config.ts                    # deps.optimizer configuration
│   ├── logging-sdk-optimizer.test.ts       # ✅ Logging SDK with direct imports
│   ├── direct-import-works.test.ts         # ✅ Direct API with direct imports
│   ├── worker.test.ts                      # HTTP-based tests for Eval()
│   └── eval-works-now.test.ts              # Experimental Eval() test
└── README.md                                # This file
```

## Example Tests

### Logging SDK with Direct Imports ✅

```typescript
// ✅ This WORKS!
import { init, login, wrapOpenAI } from 'braintrust';
import { env } from 'cloudflare:test';

test('logging SDK experiment', async () => {
  await login({ apiKey: env.BRAINTRUST_API_KEY });

  const experiment = init({
    project: 'test-project',
    experiment: 'test-experiment',
  });

  await experiment.traced(async (span) => {
    span.log({
      input: 'test',
      output: 'result',
      scores: { correctness: 1 },
    });
  });

  const summary = await experiment.summarize();
  expect(summary).toBeDefined();
});
```

**See:** `logging-sdk-optimizer.test.ts`

### Direct API with Direct Imports ✅

```typescript
// ✅ This WORKS!
import { runExperimentWithDirectAPI } from '../../src/direct-api';
import { env } from 'cloudflare:test';

test('direct API experiment', async () => {
  const result = await runExperimentWithDirectAPI({
    BRAINTRUST_API_KEY: env.BRAINTRUST_API_KEY,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
  });

  expect(result.project).toBeDefined();
  expect(result.experiment).toBeDefined();
  expect(result.summary).toBeDefined();
});
```

**See:** `direct-import-works.test.ts`

### Eval() via HTTP Testing ✅

```typescript
// ✅ HTTP testing works for Eval()
import { SELF } from 'cloudflare:test';

test('eval endpoint', async () => {
  const response = await SELF.fetch('http://example.com/run-eval');
  expect(response.status).toBe(200);

  const data = await response.json();
  expect(data.success).toBe(true);
  expect(data.summary).toBeDefined();
});
```

**See:** `worker.test.ts`

### Eval() with Direct Imports ❌

```typescript
// ❌ This does NOT work - Eval is not exported for edge environments
import { Eval } from 'braintrust';

test('eval test', async () => {
  await Eval('test', { ... }); // Error: Eval is undefined
});
```

## Why Eval() Doesn't Work with Direct Imports

`Eval()` is intentionally not exported in the browser/edge build of the Braintrust SDK. It requires Node.js-specific features that don't exist in Cloudflare Workers:

- File system access for dataset loading
- Process spawning for parallel execution
- Node.js-only modules

**Solution:** Use the Logging SDK (which works with direct imports) or test Eval() via HTTP endpoints.

**See:** `../docs/WHY_EVAL_DOESNT_WORK.md` for technical details.

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npx vitest run test/integration/logging-sdk-optimizer.test.ts

# Run in watch mode
npx vitest --config test/integration/vitest.config.ts
```

## Test Results

Expected output:

```
✓ test/integration/logging-sdk-optimizer.test.ts (2 tests)
  ✓ Logging SDK with deps.optimizer works
  ✓ Custom scoring functions work

✓ test/integration/direct-import-works.test.ts (1 test)
  ✓ Direct import of Braintrust code works

✓ test/integration/worker.test.ts (4 tests)
  ✓ Worker responds to fetch requests
  ✓ Eval endpoint works via HTTP
  ✓ Experiment endpoint works via HTTP
  ✓ Direct API endpoint works via HTTP

Test Files  3 passed (3)
     Tests  7 passed (7)
```

## Summary

| Approach | Direct Import | HTTP Testing | Best For |
|----------|--------------|--------------|----------|
| **Logging SDK** | ✅ YES (deps.optimizer) | ✅ YES | Unit tests, experiments |
| **Tracing** | ✅ YES (deps.optimizer) | ✅ YES | Observability tests |
| **Direct API** | ✅ YES | ✅ YES | All testing |
| **Eval()** | ❌ NO | ✅ YES | Production code only |

**Recommendation:** Use **Logging SDK** or **Direct API** for testing. Both support direct imports with `deps.optimizer` configuration.

See [../README.md](../README.md#testing) for more details.
