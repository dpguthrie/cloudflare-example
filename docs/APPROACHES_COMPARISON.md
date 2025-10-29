# Braintrust Approaches in Cloudflare Workers

This example repo demonstrates four ways to use Braintrust on Cloudflare Workers.

## ✅ All Approaches Work in Production!

All approaches work in Cloudflare Workers with the `nodejs_compat` flag:

1. **Eval()** - High-level declarative API
2. **Logging SDK** - Lower-level imperative API (init + traced + log)
3. **Direct API** - Pure REST API calls, no SDK
4. **Tracing** - Real-time observability with tool calls

## Test Results

```bash
$ npm test

✓ test/integration/worker.test.ts (4 tests) 42ms
  ✓ should respond to fetch requests
  ✓ should have run-eval endpoint available
  ✓ should be able to run eval with proper environment
  ✓ should run experiment using logging SDK

Test Files  1 passed (1)
     Tests  4 passed (4)
```

## Approach 1: Eval() Function

### Code Example

```typescript
import { Eval, login } from 'braintrust';

async function runEvaluation(env: Env) {
  await login({ apiKey: env.BRAINTRUST_API_KEY });

  const result = await Eval("my-experiment", {
    data: () => [
      { input: "What is 2+2?", expected: "4" },
      { input: "What is the capital of France?", expected: "Paris" },
    ],
    task: async (input) => {
      // Your LLM call here
      const response = await callOpenAI(input);
      return response;
    },
    scores: [
      (output, expected) => ({
        name: "contains_expected",
        score: output.includes(expected.expected) ? 1 : 0,
      }),
    ],
  });

  return result;
}
```

### Characteristics

| Aspect | Details |
|--------|---------|
| **Complexity** | Simple, declarative |
| **Control** | Less - framework manages execution |
| **Setup** | Minimal code |
| **Use Case** | Standard evaluations, quick setup |
| **Endpoint** | `/run-eval` in this repo |

### When to Use

- ✅ You want quick, simple evaluation setup
- ✅ Standard evaluation patterns fit your needs
- ✅ You're okay with framework abstractions

## Approach 2: Logging SDK (init + traced + log)

### Code Example

```typescript
import { init, login, wrapOpenAI } from 'braintrust';
import OpenAI from 'openai';

async function runExperiment(env: Env) {
  await login({ apiKey: env.BRAINTRUST_API_KEY });

  // Initialize experiment
  const experiment = init({
    project: "my-project",
    experiment: "my-experiment",
    apiKey: env.BRAINTRUST_API_KEY,
  });

  // Wrap OpenAI for automatic nested tracing
  const client = wrapOpenAI(new OpenAI({ apiKey: env.OPENAI_API_KEY }));

  // Test dataset
  const dataset = [
    { input: "What is 2+2?", expected: "4" },
    { input: "What is the capital of France?", expected: "Paris" },
  ];

  // Run test cases
  const promises = [];
  for (const { input, expected } of dataset) {
    promises.push(
      experiment.traced(async (span) => {
        // wrapOpenAI creates nested spans automatically
        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: input }],
        });

        const output = response.choices[0].message.content;

        // Score the output
        const score = output.includes(expected) ? 1 : 0;

        // Log to Braintrust
        span.log({
          input,
          output,
          expected,
          scores: { contains_expected: score },
          metadata: { model: response.model, usage: response.usage },
        });

        return { input, output, expected, score };
      })
    );
  }

  await Promise.all(promises);

  // Get summary
  const summary = await experiment.summarize();
  return { summary, experimentUrl: `https://braintrust.dev/...` };
}
```

### Characteristics

| Aspect | Details |
|--------|---------|
| **Complexity** | More code, imperative style |
| **Control** | Full - you manage execution flow |
| **Setup** | More boilerplate |
| **Use Case** | Custom logic, framework integration |
| **Endpoint** | `/run-experiment` in this repo |

### When to Use

- ✅ You need custom evaluation logic
- ✅ Integrating with existing testing framework
- ✅ Want full control over execution
- ✅ Need to add custom metadata/tracking
- ✅ Running evals in non-standard ways

## Key Differences

| Feature | Eval() | Logging SDK | Direct API | Tracing |
|---------|--------|-------------|------------|---------|
| **Code Style** | Declarative | Imperative | Imperative | Imperative |
| **Boilerplate** | Minimal | Moderate | More | Minimal |
| **Flexibility** | Limited | Full | Full | Full |
| **Learning Curve** | Easy | Moderate | Moderate | Easy |
| **SDK Dependency** | Yes | Yes | No | Yes |
| **Vitest Direct Import** | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| **Nested Tracing** | Automatic | Automatic | Manual (OTEL) | Automatic |
| **Use Case** | Evaluations | Experiments | Testing/Custom | Observability |
| **Parallel Execution** | Automatic | Manual | Manual | N/A |
| **Custom Scoring** | Via callback | Via span.log() | Via API | N/A |

## Both Work in Cloudflare Workers!

### Production

Both approaches work perfectly in production with `nodejs_compat`:

```toml
# wrangler.toml
compatibility_flags = ["nodejs_compat"]
```

### Testing

**Vitest Testing with `deps.optimizer`:**

| Approach | Direct Import in Vitest | HTTP Testing |
|----------|------------------------|--------------|
| **Logging SDK** | ✅ YES (with deps.optimizer) | ✅ YES |
| **Tracing** | ✅ YES (with deps.optimizer) | ✅ YES |
| **Direct API** | ✅ YES | ✅ YES |
| **Eval()** | ❌ NO | ✅ YES |

**Working example with direct imports:**

```typescript
// ✅ This WORKS with deps.optimizer configuration!
import { init, login, wrapOpenAI } from 'braintrust';

test('logging SDK', async () => {
  await login({ apiKey: env.BRAINTRUST_API_KEY });
  const experiment = init({ project: 'test', experiment: 'test' });
  await experiment.traced(async (span) => {
    span.log({ input: 'test', output: 'result' });
  });
  const summary = await experiment.summarize();
  expect(summary).toBeDefined();
});
```

**Configuration:** See `test/integration/vitest.config.ts` for `deps.optimizer` setup.

**See working examples:**
- `test/integration/logging-sdk-optimizer.test.ts` - Logging SDK with direct imports
- `test/integration/direct-import-works.test.ts` - Direct API with direct imports
- `test/integration/worker.test.ts` - HTTP-based tests for all approaches

## Approach 3: Direct REST API

### Code Example

```typescript
// Create experiment
const project = await fetch('https://api.braintrust.dev/v1/project', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: JSON.stringify({ name: 'my-project' }),
});

const experiment = await fetch('https://api.braintrust.dev/v1/experiment', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: JSON.stringify({ project_id, name: 'my-experiment' }),
});

// Insert events
await fetch(`https://api.braintrust.dev/v1/experiment/${experimentId}/insert`, {
  method: 'POST',
  body: JSON.stringify({
    events: [{ input, output, expected, scores }]
  }),
});
```

### Characteristics

| Aspect | Details |
|--------|---------|
| **Complexity** | More code, pure HTTP |
| **Control** | Complete control |
| **Setup** | No SDK dependency |
| **Use Case** | Testing, custom integrations |
| **Endpoint** | `/run-direct-api` in this repo |

### When to Use

- ✅ Writing Vitest tests with direct imports
- ✅ You want zero SDK dependencies
- ✅ Maximum control over API calls
- ✅ Building custom integrations

## Approach 4: Real-Time Tracing

### Code Example

```typescript
import { initLogger, wrapOpenAI, wrapTraced } from 'braintrust';

const logger = initLogger({
  projectName: "my-app",
  apiKey: env.BRAINTRUST_API_KEY,
  asyncFlush: true,
});

const client = wrapOpenAI(new OpenAI({ apiKey: env.OPENAI_API_KEY }));

const getTool = wrapTraced(async (arg: string) => {
  return result;
}, { name: "getTool" });

await logger.traced(async (span) => {
  const response = await client.chat.completions.create({...});
  const result = await getTool(arg);
  span.log({ input, output: result });
});

ctx.waitUntil(logger.flush());
```

### Characteristics

| Aspect | Details |
|--------|---------|
| **Complexity** | Simple, automatic tracing |
| **Control** | Full control |
| **Setup** | Minimal code |
| **Use Case** | Observability, monitoring |
| **Endpoint** | `/trace` in this repo |

### When to Use

- ✅ Real-time observability of LLM applications
- ✅ Monitoring tool calling behavior
- ✅ Debugging production issues
- ✅ Understanding nested LLM calls

## Which Should You Use?

### Choose Eval() if:
- 🎯 You want the simplest possible setup
- 🎯 Standard evaluation patterns work for you
- 🎯 You're just getting started

### Choose Logging SDK if:
- 🎯 You need custom evaluation orchestration
- 🎯 Integrating with existing test framework
- 🎯 You want maximum control
- 🎯 You have complex scoring/metadata needs
- 🎯 You want to test with Vitest direct imports

### Choose Direct API if:
- 🎯 Writing Vitest tests (best testability)
- 🎯 You want zero SDK dependencies
- 🎯 Building custom integrations
- 🎯 Maximum control over HTTP calls

### Choose Tracing if:
- 🎯 Real-time observability is your primary need
- 🎯 Monitoring production LLM applications
- 🎯 Understanding tool calling flows
- 🎯 Not running evaluations/experiments

## Example Endpoints

Try all approaches in this repo:

```bash
# Tracing
curl https://your-worker.workers.dev/trace

# Eval() approach
curl https://your-worker.workers.dev/run-eval

# Logging SDK approach
curl https://your-worker.workers.dev/run-experiment

# Direct API approach
curl https://your-worker.workers.dev/run-direct-api
```

## Code Location

- **Tracing implementation:** `src/index.ts:10-206`
- **Eval() implementation:** `src/index.ts:208-265`
- **Logging SDK implementation:** `src/index.ts:280-365`
- **Direct API implementation:** `src/direct-api.ts`
- **Test coverage:** `test/integration/`

## Resources

- [Braintrust Eval() Docs](https://www.braintrust.dev/docs/guides/evals)
- [Braintrust Logging SDK Docs](https://www.braintrust.dev/docs/platform/experiments/write#logging-sdk)
- [Braintrust REST API Docs](https://www.braintrust.dev/docs/reference/api/Experiments)
- [Testing Guide](../test/README.md)
- [Why Eval() Doesn't Work in Vitest](./WHY_EVAL_DOESNT_WORK.md)
- [Vitest Solution Guide](./VITEST_SOLUTION.md)

## Conclusion

**All four approaches work in production** on Cloudflare Workers with `nodejs_compat`.

**For Vitest testing:**
- ✅ **Logging SDK** - Works with `deps.optimizer` (RECOMMENDED for testing)
- ✅ **Direct API** - Works with direct imports (RECOMMENDED for testing)
- ✅ **Tracing** - Works with `deps.optimizer`
- ❌ **Eval()** - Use HTTP-based tests

Choose based on your use case:
- **Simple evaluations** → Eval()
- **Custom experiments + testing** → Logging SDK
- **Maximum testability, no SDK** → Direct API
- **Observability** → Tracing
