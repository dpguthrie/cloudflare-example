# Braintrust + Vitest: The Complete Solution

## TL;DR

**Question:** Can I use Braintrust with Vitest on Cloudflare Workers?

**Answer:**
- ✅ **Logging SDK** (`init`, `traced`, `log`) - Works with `deps.optimizer` config! (RECOMMENDED)
- ❌ **Eval()** - Does not work (Node.js-only function)
- ✅ **Direct REST API + OpenTelemetry** - Also works with direct imports!

## The Problem

The Braintrust SDK has dependencies that weren't available in Vitest's Cloudflare Workers test environment.

```typescript
// ❌ This used to NOT work
import { init } from 'braintrust';

test('my test', async () => {
  const experiment = init({ ... }); // Error: Module resolution
});
```

## The Solution: deps.optimizer (RECOMMENDED)

Configure Vitest to bundle the Braintrust SDK using `deps.optimizer.ssr.include`:

```typescript
// vitest.config.ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  resolve: {
    conditions: ['import', 'module', 'node', 'default'],
  },
  test: {
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: [
            'braintrust',
            'uuid',
            '@opentelemetry/api',
            '@opentelemetry/sdk-trace-base',
            '@opentelemetry/exporter-trace-otlp-http',
          ],
        },
      },
    },
  },
});
```

Now you can directly import and use the Logging SDK:

```typescript
// ✅ This WORKS with deps.optimizer!
import { init, login, wrapOpenAI } from 'braintrust';
import OpenAI from 'openai';

test('my test', async () => {
  await login({ apiKey: env.BRAINTRUST_API_KEY });

  const experiment = init({
    project: 'my-project',
    experiment: 'my-experiment'
  });

  const client = wrapOpenAI(new OpenAI({ apiKey: env.OPENAI_API_KEY }));

  await experiment.traced(async (span) => {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello!' }],
    });

    span.log({
      input: 'Hello!',
      output: response.choices[0].message.content,
      scores: { test: 1 },
    });
  });

  const summary = await experiment.summarize();
  expect(summary).toBeDefined();
});
```

**Proof:** See `test/integration/logging-sdk-optimizer.test.ts` - full working example!

## Alternative: Direct REST API

If you prefer not to use the SDK at all, use Braintrust's REST APIs directly:

```typescript
// ✅ This also WORKS!
const response = await fetch('https://api.braintrust.dev/v1/experiment', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: JSON.stringify({ project_id, name }),
});
```

**Proof:** See `test/integration/direct-import-works.test.ts`

## Comparison

| Approach | Production | Vitest Direct Import | Configuration Required |
|----------|-----------|---------------------|----------------------|
| **Eval()** | ✅ Works | ❌ No | N/A |
| **Logging SDK** | ✅ Works | ✅ **YES!** (deps.optimizer) | Medium - config file |
| **Direct API** | ✅ Works | ✅ **YES!** | Low - just code |

## How to Use Direct API

### 1. Create Experiment

```typescript
const response = await fetch('https://api.braintrust.dev/v1/experiment', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    project_id: projectId,
    name: 'my-experiment',
  }),
});

const experiment = await response.json();
```

### 2. Insert Events

```typescript
await fetch(`https://api.braintrust.dev/v1/experiment/${experiment.id}/insert`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    events: [
      {
        input: 'What is 2+2?',
        output: '4',
        expected: '4',
        scores: { correctness: 1 },
      },
    ],
  }),
});
```

### 3. Get Summary

```typescript
const summary = await fetch(
  `https://api.braintrust.dev/v1/experiment/${experiment.id}/summarize`,
  {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  }
);
```

## Full Example

See `src/direct-api.ts` for a complete implementation including:
- Project creation
- Experiment creation
- Event insertion
- Summary retrieval
- Error handling

## Testing

### Direct Import (Unit Tests)

```typescript
// test/my-test.test.ts
import { runExperimentWithDirectAPI } from '../src/direct-api';

test('experiment runs successfully', async () => {
  const result = await runExperimentWithDirectAPI(env);

  expect(result.results).toHaveLength(3);
  expect(result.summary).toBeDefined();
  expect(result.experimentUrl).toBeDefined();
});
```

### HTTP Integration Tests

```typescript
import { SELF } from 'cloudflare:test';

test('direct API endpoint works', async () => {
  const response = await SELF.fetch('http://example.com/run-direct-api');
  expect(response.status).toBe(200);

  const data = await response.json();
  expect(data.success).toBe(true);
});
```

## OpenTelemetry Integration

OpenTelemetry works perfectly in Vitest:

```typescript
import { trace } from '@opentelemetry/api';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';

// ✅ This works!
const provider = new BasicTracerProvider();
const tracer = trace.getTracer('my-tracer');

const span = tracer.startSpan('my-operation');
span.setAttribute('key', 'value');
span.end();
```

For full OpenTelemetry integration with Braintrust, see: [OpenTelemetry Integration Docs](https://www.braintrust.dev/docs/integrations/opentelemetry)

## API Documentation

- [Create Experiment](https://www.braintrust.dev/docs/reference/api/Experiments#create-experiment)
- [Insert Events](https://www.braintrust.dev/docs/reference/api/Experiments#insert-experiment-events)
- [Summarize Experiment](https://www.braintrust.dev/docs/reference/api/Experiments#summarize-experiment)
- [Get Project](https://www.braintrust.dev/docs/reference/api/Projects)

## When to Use Each Approach

### Use Direct API when:
- ✅ Writing unit tests with Vitest
- ✅ You need maximum control over the HTTP calls
- ✅ You want to avoid SDK dependencies
- ✅ You're building custom integrations

### Use SDK (Eval/Logging) when:
- ✅ Rapid prototyping in production code
- ✅ You want automatic tracing with wrapOpenAI
- ✅ Standard evaluation patterns fit your needs
- ✅ You're okay with HTTP-only testing in Vitest

## Test Results

All approaches work in production and can be tested:

```bash
$ npm test

✓ test/integration/direct-api.test.ts (2 tests)
  ✓ Direct Braintrust API + OpenTelemetry works
  ✓ OpenTelemetry imports work

✓ test/integration/direct-import-works.test.ts (1 test)
  ✓ Direct Import of Braintrust Code (NO SDK) works

✓ test/integration/worker.test.ts (4 tests)
  ✓ Eval() works via HTTP
  ✓ Logging SDK works via HTTP

Test Files  3 passed (3)
Tests  7 passed (7)
```

## Conclusion

**For Vitest testing:** Use the **Direct REST API approach** for the best developer experience. You can write proper unit tests with direct imports, just like any other code.

**For production:** All three approaches work. Choose based on your needs for convenience vs. control.
