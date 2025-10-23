import { Eval, login, initLogger, wrapOpenAI, wrapTraced } from "braintrust";
import OpenAI from "openai";

export interface Env {
  BRAINTRUST_API_KEY: string;
  OPENAI_API_KEY: string;
}

async function runTracingExample(env: Env, ctx: ExecutionContext) {
  // Authenticate with Braintrust
  await login({
    apiKey: env.BRAINTRUST_API_KEY,
  });

  // Initialize logger with asyncFlush enabled (default)
  const logger = initLogger({
    projectName: "cloudflare-worker-tracing",
    apiKey: env.BRAINTRUST_API_KEY,
    asyncFlush: true,
  });

  // Mock tool functions wrapped with tracing
  const getCurrentWeather = wrapTraced(async (location: string, unit: string = "fahrenheit") => {
    // Simulate API call to weather service
    const weatherData: Record<string, any> = {
      "San Francisco": { temperature: 68, condition: "sunny" },
      "Tokyo": { temperature: 75, condition: "cloudy" },
      "Paris": { temperature: 55, condition: "rainy" },
    };

    const data = weatherData[location] || { temperature: 70, condition: "unknown" };
    return JSON.stringify({
      location,
      temperature: data.temperature,
      unit,
      condition: data.condition,
    });
  }, { name: "getCurrentWeather" });

  const searchDatabase = wrapTraced(async (query: string) => {
    // Simulate database search
    const results: Record<string, string[]> = {
      "python": ["Python is a high-level programming language", "Created by Guido van Rossum"],
      "typescript": ["TypeScript is a superset of JavaScript", "Developed by Microsoft"],
    };

    const matches = results[query.toLowerCase()] || ["No results found"];
    return JSON.stringify({ query, results: matches });
  }, { name: "searchDatabase" });

  // Wrap OpenAI client
  const client = wrapOpenAI(
    new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    })
  );

  // Example with tool calls
  const result = await logger.traced(async (span) => {
    span.log({
      input: "User asks about weather in San Francisco and information about Python",
    });

    // First call: Ask about weather with tool calling
    const weatherResponse = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: "What's the weather like in San Francisco?",
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "getCurrentWeather",
            description: "Get the current weather in a given location",
            parameters: {
              type: "object",
              properties: {
                location: {
                  type: "string",
                  description: "The city name, e.g. San Francisco",
                },
                unit: {
                  type: "string",
                  enum: ["celsius", "fahrenheit"],
                },
              },
              required: ["location"],
            },
          },
        },
      ],
      tool_choice: "auto",
    });

    let weatherResult = "";
    const weatherMessage = weatherResponse.choices[0].message;

    // Handle tool calls
    if (weatherMessage.tool_calls) {
      const toolCall = weatherMessage.tool_calls[0];
      const functionArgs = JSON.parse(toolCall.function.arguments);
      const functionResult = await getCurrentWeather(
        functionArgs.location,
        functionArgs.unit
      );
      weatherResult = functionResult;

      // Follow-up call with tool result
      const followUpResponse = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: "What's the weather like in San Francisco?",
          },
          weatherMessage,
          {
            role: "tool",
            tool_call_id: toolCall.id,
            content: functionResult,
          },
        ],
      });

      weatherResult = followUpResponse.choices[0].message.content || "";
    }

    // Second call: Search for information
    const searchResponse = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: "Tell me about Python programming language",
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "searchDatabase",
            description: "Search the knowledge database",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query",
                },
              },
              required: ["query"],
            },
          },
        },
      ],
    });

    let searchResult = "";
    const searchMessage = searchResponse.choices[0].message;

    if (searchMessage.tool_calls) {
      const toolCall = searchMessage.tool_calls[0];
      const functionArgs = JSON.parse(toolCall.function.arguments);
      const functionResult = await searchDatabase(functionArgs.query);
      searchResult = functionResult;

      // Follow-up with tool result
      const finalResponse = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: "Tell me about Python programming language",
          },
          searchMessage,
          {
            role: "tool",
            tool_call_id: toolCall.id,
            content: functionResult,
          },
        ],
      });

      searchResult = finalResponse.choices[0].message.content || "";
    }

    const output = {
      weather: weatherResult,
      search: searchResult,
    };

    span.log({ output });
    return output;
  });

  // Flush the logger and use waitUntil to ensure it completes
  const flushPromise = logger.flush();
  ctx.waitUntil(flushPromise);

  return result;
}

async function runEval(env: Env) {
  // Authenticate with Braintrust using the API key
  await login({
    apiKey: env.BRAINTRUST_API_KEY,
  });

  const result = await Eval("cloudflare-worker-eval", {
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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/trace") {
      try {
        const result = await runTracingExample(env, ctx);

        return new Response(
          JSON.stringify({
            success: true,
            result,
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
            stack: error instanceof Error ? error.stack : undefined,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

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
          "/trace": "Run tracing example with OpenAI tool calls",
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
