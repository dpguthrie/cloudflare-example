# Braintrust Eval on Cloudflare Workers

This example shows how to run Braintrust evaluations on Cloudflare Workers, both on-demand (via HTTP) and on a schedule (via Cron Triggers).

## Setup

### 1. Install dependencies

```bash
cd ~/repos/cloudflare-example
npm install
```

### 2. Set up secrets

You need to configure your API keys as Cloudflare secrets:

```bash
# Set your Braintrust API key
npx wrangler secret put BRAINTRUST_API_KEY

# Set your OpenAI API key
npx wrangler secret put OPENAI_API_KEY
```

When prompted, paste your API keys (you can find your Braintrust API key at https://www.braintrust.dev/app/settings?subroute=api-keys).

### 3. Deploy to Cloudflare

```bash
npm run deploy
```

This will deploy your worker and give you a URL like `https://braintrust-eval-worker.your-subdomain.workers.dev`

## Usage

### Run eval via HTTP (on-demand)

After deploying, trigger the eval by visiting or curling the `/run-eval` endpoint:

```bash
curl https://braintrust-eval-worker.your-subdomain.workers.dev/run-eval
```

You'll get a JSON response with the eval results:

```json
{
  "success": true,
  "summary": {
    "score": 1.0,
    "num_scores": 3
  },
  "results": [...]
}
```

### Run eval on a schedule (cron)

To run the eval automatically on a schedule, uncomment the `[triggers]` section in `wrangler.toml`:

```toml
[triggers]
crons = ["0 0 * * *"]  # Daily at midnight UTC
```

Then redeploy:

```bash
npm run deploy
```

**Cron schedule examples:**
- `"0 0 * * *"` - Daily at midnight UTC
- `"0 */6 * * *"` - Every 6 hours
- `"0 9 * * 1"` - Every Monday at 9am UTC
- `"*/15 * * * *"` - Every 15 minutes

## Local Development

Test your worker locally before deploying:

```bash
npm run dev
```

This starts a local server at `http://localhost:8787`. You can test it with:

```bash
curl http://localhost:8787/run-eval
```

**Note:** For local dev, you'll need to set secrets locally or use a `.dev.vars` file:

```bash
# Create .dev.vars (don't commit this!)
echo "BRAINTRUST_API_KEY=your-key-here" > .dev.vars
echo "OPENAI_API_KEY=your-key-here" >> .dev.vars
```

## Project Structure

```
cloudflare-example/
├── src/
│   └── index.ts          # Main worker code with eval logic
├── wrangler.toml         # Cloudflare Worker configuration
├── tsconfig.json         # TypeScript configuration
├── package.json          # Dependencies
└── README.md             # This file
```

## How It Works

1. **HTTP Endpoint (`/run-eval`)**: Triggers the eval when you make a GET/POST request
2. **Scheduled Event**: Runs the eval automatically based on cron schedule
3. **Eval Logic**:
   - Fetches test cases from the `data` array
   - Calls OpenAI API for each test case
   - Scores responses using custom scoring function
   - Returns results to Braintrust

## Customizing the Eval

Edit `src/index.ts` to customize:

- **Test data**: Update the `data` array with your own questions/expected answers
- **Model**: Change `gpt-4o-mini` to any OpenAI model
- **Scoring**: Modify the scoring function to match your evaluation criteria
- **Task**: Replace the OpenAI call with any AI API or custom logic

## Monitoring

View your worker logs in the Cloudflare dashboard:
1. Go to https://dash.cloudflare.com
2. Select "Workers & Pages"
3. Click on your worker
4. View real-time logs and metrics

## Troubleshooting

**"Error: No API key found"**
- Make sure you ran `wrangler secret put BRAINTRUST_API_KEY` and `wrangler secret put OPENAI_API_KEY`

**"Worker exceeded CPU time limit"**
- Free tier has 10ms CPU limit, paid tier ($5/mo) has 30s limit
- Reduce the number of test cases or optimize your eval

**"Module not found"**
- Run `npm install` to ensure all dependencies are installed

## Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Braintrust SDK Docs](https://www.braintrust.dev/docs)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
