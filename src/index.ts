import { Eval } from "braintrust";

export interface Env {
  BRAINTRUST_API_KEY: string;
  OPENAI_API_KEY: string;
}

async function runEval(env: Env) {
  const result = await Eval("cloudflare-worker-eval", {
    apiKey: env.BRAINTRUST_API_KEY,
    data: () => [
      { input: "What is 2+2?", expected: "4" },
      { input: "What is the capital of France?", expected: "Paris" },
      { input: "What color is the sky?", expected: "blue" },
    ],
    task: async (input) => {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant. Answer questions concisely.",
            },
            {
              role: "user",
              content: input,
            },
          ],
          temperature: 0,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };
      return data.choices[0].message.content;
    },
    scores: [
      (output, expected) => {
        const outputLower = output?.toLowerCase() || "";
        const expectedLower = expected?.expected?.toLowerCase() || "";
        return {
          name: "contains_expected",
          score: outputLower.includes(expectedLower) ? 1 : 0,
        };
      },
    ],
  });

  return result;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/run-eval") {
      try {
        const result = await runEval(env);

        return new Response(
          JSON.stringify({
            success: true,
            summary: result.summary,
            results: result.results,
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
            debug: {
              envKeys: Object.keys(env),
              hasBraintrustKey: "BRAINTRUST_API_KEY" in env,
              braintrustKeyType: typeof env.BRAINTRUST_API_KEY,
              braintrustKeyLength: env.BRAINTRUST_API_KEY?.length,
              braintrustKeyPrefix: env.BRAINTRUST_API_KEY?.substring(0, 10),
            }
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    return new Response(
      JSON.stringify({
        message: "Braintrust Eval Worker",
        endpoints: {
          "/run-eval": "Run the evaluation",
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runEval(env));
  },
};
