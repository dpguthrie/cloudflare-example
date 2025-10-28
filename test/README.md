# Testing

Integration tests for Braintrust SDK on Cloudflare Workers.

## Quick Start

```bash
# Run tests
npm test
```

## How It Works

Tests use a workaround for Vitest's Workers integration limitations:

1. **Build with wrangler** - Includes all Node.js polyfills
2. **Test the compiled output** - Same code that runs in production
3. **HTTP-based testing** - Test via endpoints, not direct imports

## Why This Approach?

**Problem:** Vitest's Workers integration doesn't provide all Node.js modules (`node:os`, `node:child_process`, etc.) that Braintrust SDK requires.

**Solution:** Test the wrangler-built output which has all polyfills baked in.

## Test Structure

```
test/
├── integration/
│   ├── vitest.config.ts  # Points to wrangler build output
│   └── worker.test.ts    # HTTP-based integration tests
└── README.md             # This file
```

## Tests Included

- ✅ Basic worker functionality
- ✅ `/run-eval` endpoint (Eval() approach)
- ✅ `/run-experiment` endpoint (Logging SDK approach)

## Important Note

You **cannot** directly import **ANY** Braintrust SDK functions in tests. This limitation applies to **both approaches**:

```typescript
// ❌ Neither of these work in Vitest
import { Eval } from 'braintrust';
import { init } from 'braintrust';

// Both will fail with module resolution errors
await Eval('test', { ... });

const experiment = init({ ... });
await experiment.traced(async (span) => { ... });
```

Instead, test via HTTP endpoints:

```typescript
// ✅ Works for both approaches
import { SELF } from 'cloudflare:test';

const response = await SELF.fetch('http://example.com/run-eval');
const response = await SELF.fetch('http://example.com/run-experiment');
```

See [../README.md](../README.md#testing) for more details.
