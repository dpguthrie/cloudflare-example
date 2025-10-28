# Braintrust SDK Approaches in Cloudflare Workers

This document compares two ways to run experiments with the Braintrust SDK on Cloudflare Workers.

## ✅ Both Approaches Work!

We've tested **both approaches** and confirmed they work in Cloudflare Workers with the `nodejs_compat` flag:

1. **Eval()** - High-level declarative API
2. **Logging SDK** - Lower-level imperative API (init + traced + log)

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

| Feature | Eval() | Logging SDK |
|---------|--------|-------------|
| **Code Style** | Declarative config | Imperative code |
| **Boilerplate** | Minimal | More |
| **Flexibility** | Limited | Full |
| **Learning Curve** | Easy | Moderate |
| **Nested Tracing** | Automatic | Automatic (with wrapOpenAI) |
| **Parallel Execution** | Automatic | Manual (Promise.all) |
| **Custom Scoring** | Via callback | Via span.log() |
| **Integration** | Standalone | Easy to embed |

## Both Work in Cloudflare Workers!

### Production

Both approaches work perfectly in production with `nodejs_compat`:

```toml
# wrangler.toml
compatibility_flags = ["nodejs_compat"]
```

### Testing

**Important:** You cannot directly import the Braintrust SDK in Vitest tests. This applies to **both** Eval() and Logging SDK approaches.

```typescript
// ❌ Neither approach works with direct imports in Vitest
import { Eval, init } from 'braintrust';
```

**Solution:** Both approaches work in Vitest using HTTP-based integration tests:

```bash
# Build with wrangler (includes polyfills)
npm run build:test

# Test via HTTP endpoints
npm run test:integration
```

This tests your production code (the compiled worker) via HTTP, which is how it will actually run in production.

## Which Should You Use?

### Choose Eval() if:
- 🎯 You want the simplest possible setup
- 🎯 Standard evaluation patterns work for you
- 🎯 You're just getting started with Braintrust

### Choose Logging SDK if:
- 🎯 You need custom evaluation orchestration
- 🎯 Integrating with existing test framework
- 🎯 You want maximum control
- 🎯 You have complex scoring/metadata needs

## Example Endpoints

Try both approaches in this repo:

```bash
# Eval() approach
curl https://your-worker.workers.dev/run-eval

# Logging SDK approach
curl https://your-worker.workers.dev/run-experiment
```

## Code Location

- **Eval() implementation:** `src/index.ts:207-264`
- **Logging SDK implementation:** `src/index.ts:279-371`
- **Test coverage:** `test/integration/worker.test.ts`

## Resources

- [Braintrust Eval() Docs](https://www.braintrust.dev/docs/guides/evals)
- [Braintrust Logging SDK Docs](https://www.braintrust.dev/docs/platform/experiments/write#logging-sdk)
- [Testing Guide](./WORKAROUND.md)
- [Technical Findings](./VITEST_FINDINGS.md)

## Conclusion

**Both approaches are viable** on Cloudflare Workers. Choose based on your needs:

- **Simple evaluations** → Use Eval()
- **Custom/complex logic** → Use Logging SDK

The testing workaround works for both, so there's no difference in testability.
