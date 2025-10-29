# Braintrust SDK on Cloudflare Workers

Example implementation showing how to run Braintrust evaluations and experiments on Cloudflare Workers using two different approaches.

## Quick Start

```bash
# Install dependencies
npm install

# Set up local environment
echo "BRAINTRUST_API_KEY=your-key" > .dev.vars
echo "OPENAI_API_KEY=your-key" >> .dev.vars

# Run locally
npm run dev

# Test the endpoints
curl http://localhost:8787/trace              # Tracing example
curl http://localhost:8787/run-eval           # Eval() approach
curl http://localhost:8787/run-experiment     # Logging SDK
curl http://localhost:8787/run-direct-api     # Direct API

# Deploy to production
npm run deploy
```

## Four Examples

This example demonstrates **four ways** to use Braintrust on Cloudflare Workers:

### Evaluation & Experimentation:
1. **Eval()** - High-level SDK for evaluations
2. **Logging SDK** - Full control with init + traced + log (✅ **WORKS in Vitest** with deps.optimizer!)
3. **Direct API** - No SDK, pure REST API calls (✅ **WORKS in Vitest**)

### Observability:
4. **Tracing Example** - Real-time tracing with OpenAI tool calls

**🎯 Want to use Braintrust with Vitest?** See [docs/VITEST_SOLUTION.md](./docs/VITEST_SOLUTION.md) for the complete guide.

**❓ Why doesn't Eval() work in Vitest?** See [docs/WHY_EVAL_DOESNT_WORK.md](./docs/WHY_EVAL_DOESNT_WORK.md) for the technical explanation.

### Approach 1: Eval() Function

**Best for:** Simple, standard evaluations with minimal setup.

**Code:**
```typescript
import { Eval, login } from 'braintrust';

const result = await Eval("my-experiment", {
  data: () => [
    { input: "What is 2+2?", expected: "4" },
  ],
  task: async (input) => {
    // Your LLM call
    return await callOpenAI(input);
  },
  scores: [
    (output, expected) => ({
      name: "contains_expected",
      score: output.includes(expected.expected) ? 1 : 0,
    }),
  ],
});
```

**Endpoints:**
- Production: `https://your-worker.workers.dev/run-eval`
- Local: `http://localhost:8787/run-eval`

**Implementation:** See `src/index.ts:208-265`

### Approach 2: Logging SDK (init + traced + log)

**Best for:** Custom evaluation logic, framework integration, more control.

**Features:**
- ✅ Automatic nested tracing with `wrapOpenAI()`
- ✅ Full control over execution flow
- ✅ Custom metadata and scoring

**Code:**
```typescript
import { init, login, wrapOpenAI } from 'braintrust';
import OpenAI from 'openai';

// Wrap OpenAI for automatic nested tracing
const client = wrapOpenAI(new OpenAI({ apiKey: env.OPENAI_API_KEY }));

// Initialize experiment
const experiment = init({
  project: "my-project",
  experiment: "my-experiment",
  apiKey: env.BRAINTRUST_API_KEY,
});

// Run test cases
for (const { input, expected } of dataset) {
  await experiment.traced(async (span) => {
    // wrapOpenAI automatically creates nested spans for API calls
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: input }],
    });

    const output = response.choices[0].message.content;
    const score = output.includes(expected) ? 1 : 0;

    span.log({
      input,
      output,
      expected,
      scores: { contains_expected: score },
      metadata: { model: response.model, usage: response.usage },
    });
  });
}

const summary = await experiment.summarize();
```

**Endpoints:**
- Production: `https://your-worker.workers.dev/run-experiment`
- Local: `http://localhost:8787/run-experiment`

**Implementation:** See `src/index.ts:280-365`

### Approach 3: Direct REST API + OpenTelemetry ✨

**Best for:** Testing with Vitest, maximum control, no SDK dependencies.

**Key Advantage:** ✅ **Can be directly imported and tested in Vitest!**

**Code:**
```typescript
import { runExperimentWithDirectAPI } from './direct-api';

// Create experiment using REST API
const result = await runExperimentWithDirectAPI(env);

// Insert events
await insertExperimentEvents(apiKey, experimentId, [
  {
    input: 'What is 2+2?',
    output: '4',
    expected: '4',
    scores: { correctness: 1 },
  },
]);

// Get summary
const summary = await summarizeExperiment(apiKey, experimentId);
```

**Endpoints:**
- Production: `https://your-worker.workers.dev/run-direct-api`
- Local: `http://localhost:8787/run-direct-api`

**Implementation:** See `src/direct-api.ts`

**Vitest Testing:**
```typescript
// ✅ This WORKS - direct import in Vitest!
import { runExperimentWithDirectAPI } from './direct-api';

test('my test', async () => {
  const result = await runExperimentWithDirectAPI(env);
  expect(result.summary).toBeDefined();
});
```

**APIs Used:**
- [Create Experiment](https://www.braintrust.dev/docs/reference/api/Experiments#create-experiment)
- [Insert Events](https://www.braintrust.dev/docs/reference/api/Experiments#insert-experiment-events)
- [Summarize](https://www.braintrust.dev/docs/reference/api/Experiments#summarize-experiment)
- [OpenTelemetry Integration](https://www.braintrust.dev/docs/integrations/opentelemetry)

### Approach 4: Real-Time Tracing with Tool Calls

**Best for:** Observability, monitoring LLM applications, debugging tool calling behavior.

**Key Advantage:** ✅ **Real-time tracing of OpenAI tool calls with automatic nested spans!**

**Code:**
```typescript
import { initLogger, wrapOpenAI, wrapTraced } from 'braintrust';

// Initialize logger with asyncFlush
const logger = initLogger({
  projectName: "my-app",
  apiKey: env.BRAINTRUST_API_KEY,
  asyncFlush: true,
});

// Wrap OpenAI for automatic tracing
const client = wrapOpenAI(new OpenAI({ apiKey: env.OPENAI_API_KEY }));

// Wrap tool functions for tracing
const getCurrentWeather = wrapTraced(async (location: string) => {
  // Your tool logic
  return JSON.stringify({ location, temperature: 68 });
}, { name: "getCurrentWeather" });

// Trace the entire operation
await logger.traced(async (span) => {
  // OpenAI calls are automatically traced
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "What's the weather?" }],
    tools: [/* tool definitions */],
  });

  // Tool calls are traced when you invoke them
  const result = await getCurrentWeather("San Francisco");

  span.log({ input, output: result });
});

// Ensure traces are flushed (important for Workers!)
ctx.waitUntil(logger.flush());
```

**Endpoints:**
- Production: `https://your-worker.workers.dev/trace`
- Local: `http://localhost:8787/trace`

**Implementation:** See `src/index.ts:10-206`

**Features:**
- ✅ Automatic nested tracing for OpenAI calls
- ✅ Tool call tracing with wrapTraced()
- ✅ Async flush for Workers compatibility
- ✅ Real-time observability in Braintrust dashboard

### Which Should You Use?

| Feature | Eval() | Logging SDK | Direct API | Tracing |
|---------|--------|-------------|------------|---------|
| **Setup** | Minimal | More code | More code | Minimal |
| **Control** | Framework-managed | Full control | Full control | Full control |
| **Nested tracing** | Automatic | Automatic (wrapOpenAI) | Manual (OTEL) | Automatic |
| **Best for** | Standard evals | Custom evals/experiments | Testing in Vitest | Observability |
| **Learning curve** | Easy | Moderate | Moderate | Easy |
| **Vitest direct import** | ❌ No | ✅ **YES!** (deps.optimizer) | ✅ **YES!** | ✅ **YES!** (deps.optimizer) |
| **Production use** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **SDK dependency** | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes |

**See [docs/APPROACHES_COMPARISON.md](./docs/APPROACHES_COMPARISON.md) for detailed comparison.**

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Keys

#### For Local Development

Create a `.dev.vars` file (don't commit this!):

```bash
echo "BRAINTRUST_API_KEY=your-braintrust-key" > .dev.vars
echo "OPENAI_API_KEY=your-openai-key" >> .dev.vars
```

Get your Braintrust API key from: https://www.braintrust.dev/app/settings?subroute=api-keys

#### For Production

Set secrets in Cloudflare:

```bash
npx wrangler secret put BRAINTRUST_API_KEY
npx wrangler secret put OPENAI_API_KEY
```

### 3. Enable Node.js Compatibility

Already configured in `wrangler.toml`:

```toml
compatibility_flags = ["nodejs_compat"]
```

This is **required** for the Braintrust SDK to work on Cloudflare Workers.

## Local Development

### Start the Dev Server

```bash
npm run dev
```

This starts a local server at `http://localhost:8787`.

### Test All Endpoints

**Important:** Local dev uses `http://` (not `https://`)

```bash
# Tracing example
curl http://localhost:8787/trace

# Eval() approach
curl http://localhost:8787/run-eval

# Logging SDK approach
curl http://localhost:8787/run-experiment

# Direct API approach
curl http://localhost:8787/run-direct-api

# View available endpoints
curl http://localhost:8787/
```

**Common mistake:** Using `https://localhost:8787` will fail. Local dev is HTTP only.

### Watch for Changes

The dev server automatically reloads when you edit `src/index.ts`.

## Deployment

### Deploy to Production

```bash
npm run deploy
```

You'll get a URL like: `https://braintrust-eval-worker.your-subdomain.workers.dev`

### Test Production

```bash
curl https://your-worker.workers.dev/trace
curl https://your-worker.workers.dev/run-eval
curl https://your-worker.workers.dev/run-experiment
curl https://your-worker.workers.dev/run-direct-api
```

### Schedule Automatic Runs

Edit `wrangler.toml` to enable cron triggers:

```toml
[triggers]
crons = ["0 0 * * *"]  # Daily at midnight UTC
```

Then redeploy:

```bash
npm run deploy
```

**Cron examples:**
- `"0 0 * * *"` - Daily at midnight
- `"0 */6 * * *"` - Every 6 hours
- `"*/15 * * * *"` - Every 15 minutes

## Testing

### Run Integration Tests

```bash
npm test
```

Output:
```
✓ test/integration/worker.test.ts (4 tests) 42ms
  ✓ should respond to fetch requests
  ✓ should have run-eval endpoint available
  ✓ should be able to run eval with proper environment
  ✓ should run experiment using logging SDK

Test Files  1 passed (1)
     Tests  4 passed (4)
```

### Vitest Testing

#### ✅ Approaches that Work with Direct Imports (RECOMMENDED)

**Logging SDK and Tracing** work perfectly with `deps.optimizer` configuration!

```typescript
// ✅ This WORKS with deps.optimizer!
import { init, login, wrapOpenAI, initLogger } from 'braintrust';

test('logging SDK test', async () => {
  await login({ apiKey: env.BRAINTRUST_API_KEY });

  const experiment = init({
    project: 'test',
    experiment: 'my-test'
  });

  await experiment.traced(async (span) => {
    span.log({ input: 'test', output: 'result', scores: { score: 1 } });
  });

  const summary = await experiment.summarize();
  expect(summary).toBeDefined();
});
```

**Direct API** also works with direct imports:

```typescript
// ✅ Direct API approach works!
import { runExperimentWithDirectAPI } from './direct-api';

test('direct API test', async () => {
  const result = await runExperimentWithDirectAPI(env);
  expect(result.summary).toBeDefined();
});
```

**Configuration Required:** See `test/integration/vitest.config.ts` for the `deps.optimizer` setup.

See working examples:
- `test/integration/logging-sdk-optimizer.test.ts` - Logging SDK with deps.optimizer
- `test/integration/direct-import-works.test.ts` - Direct API approach

#### ❌ Eval() Does Not Work with Direct Imports

**Eval()** cannot be directly imported in Vitest tests:

```typescript
// ❌ This does NOT work
import { Eval } from 'braintrust';

test('eval test', async () => {
  await Eval('test', { ... }); // Error: Eval is not exported
});
```

**Why:** Eval() is not exported in the browser/edge build of the Braintrust SDK. It requires Node.js-specific features not available in Cloudflare Workers.

**Solution for Eval():** Test via HTTP endpoints

```typescript
// ✅ This WORKS for Eval()
import { SELF } from 'cloudflare:test';

test('eval via HTTP', async () => {
  const response = await SELF.fetch('http://example.com/run-eval');
  expect(response.status).toBe(200);
});
```

**See [test/README.md](./test/README.md) for testing details.**

## Customization

Edit `src/index.ts` to customize:

### Change the Dataset

```typescript
const dataset = [
  { input: "Your question here", expected: "Expected answer" },
  // Add more test cases
];
```

### Change the Model

```typescript
model: "gpt-4o",  // or gpt-4, gpt-3.5-turbo, etc.
```

### Change Scoring

```typescript
// Custom scoring logic
const score = myCustomScoringFunction(output, expected);

span.log({
  scores: {
    custom_metric: score,
    another_metric: anotherScore,
  },
});
```

### Use Different LLM Providers

Replace the OpenAI call with any other provider:

```typescript
// Anthropic
const response = await fetch('https://api.anthropic.com/v1/messages', ...);

// Gemini
const response = await fetch('https://generativelanguage.googleapis.com/v1/...', ...);

// Or any other API
```

## Project Structure

```
cloudflare-example/
├── src/
│   └── index.ts              # Worker code (both approaches)
├── test/
│   ├── integration/
│   │   ├── vitest.config.ts  # Test configuration
│   │   └── worker.test.ts    # Integration tests
│   └── README.md             # Testing guide
├── docs/
│   └── APPROACHES_COMPARISON.md  # Detailed comparison
├── wrangler.toml             # Worker configuration
├── package.json              # Dependencies and scripts
└── README.md                 # This file
```

## Monitoring

### View Logs

1. Go to https://dash.cloudflare.com
2. Select "Workers & Pages"
3. Click on your worker
4. View real-time logs

### View Results in Braintrust

After running an evaluation, visit the experiment URL:

```
https://www.braintrust.dev/app/projects/{project}/experiments/{id}
```

The URL is returned in the response from both endpoints.

## Troubleshooting

### "Error: No API key found"

**Solution:** Set your API keys (see Setup section above).

### "Worker exceeded CPU time limit"

**Cause:** Free tier has 10ms CPU time limit.

**Solutions:**
- Upgrade to paid tier ($5/mo) for 30s limit
- Reduce number of test cases
- Use faster models

### "Module not found"

**Solution:** Run `npm install` to install dependencies.

### Tests fail with "No such module 'node:os'"

**This is expected** if trying to import Braintrust SDK directly in tests.

**Solution:** Use integration tests via HTTP (already set up in this repo).

### Local dev not working

**Check:**
1. `.dev.vars` file exists with valid API keys
2. Port 8787 is not in use
3. Run `npm install` first

## FAQ

**Q: Does Braintrust Eval() work on Cloudflare Workers?**
A: Yes! Both Eval() and the Logging SDK work perfectly with `nodejs_compat` enabled.

**Q: Can I test Braintrust code with Vitest?**
A: Yes, but only via integration tests (HTTP endpoints), not direct imports. See Testing section above.

**Q: Which approach should I use?**
A: Use Eval() for simple cases, Logging SDK for custom logic. Both work equally well on Workers.

**Q: Can I use other AI providers besides OpenAI?**
A: Yes! Replace the API call with any provider (Anthropic, Gemini, etc.).

**Q: How do I add more test cases?**
A: Edit the `dataset` array in `src/index.ts`.

## Resources

- [Braintrust Eval() Docs](https://www.braintrust.dev/docs/guides/evals)
- [Braintrust Logging SDK Docs](https://www.braintrust.dev/docs/platform/experiments/write#logging-sdk)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
- [Node.js Compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)

## License

MIT
