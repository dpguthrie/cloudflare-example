import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { init, login, wrapOpenAI } from 'braintrust';
import OpenAI from 'openai';

/**
 * PROOF: Logging SDK works with deps.optimizer!
 *
 * This demonstrates that using deps.optimizer.ssr.include allows you to
 * directly import and use init(), traced(), and log() in Vitest tests.
 *
 * This is a MUCH better solution than:
 * - Wrangler build workaround
 * - HTTP-only testing
 * - Direct API calls
 *
 * You can write proper unit tests with the Braintrust SDK!
 */
describe('Logging SDK with deps.optimizer (RECOMMENDED)', () => {
	it('should run a complete experiment with direct imports', async () => {
		// Step 1: Login
		await login({
			apiKey: env.BRAINTRUST_API_KEY as string,
		});

		// Step 2: Initialize experiment
		const experiment = init({
			project: 'vitest-optimizer-test',
			experiment: `test-${Date.now()}`,
			apiKey: env.BRAINTRUST_API_KEY as string,
		});

		// Step 3: Wrap OpenAI for automatic tracing
		const client = wrapOpenAI(
			new OpenAI({
				apiKey: env.OPENAI_API_KEY as string,
			})
		);

		// Step 4: Run test cases
		const dataset = [
			{ input: 'What is 2+2?', expected: '4' },
			{ input: 'What is the capital of France?', expected: 'Paris' },
		];

		const results = [];
		for (const { input, expected } of dataset) {
			const result = await experiment.traced(async (span) => {
				const response = await client.chat.completions.create({
					model: 'gpt-4o-mini',
					messages: [
						{ role: 'system', content: 'Answer concisely.' },
						{ role: 'user', content: input },
					],
					temperature: 0,
				});

				const output = response.choices[0].message.content || '';
				const score = output.toLowerCase().includes(expected.toLowerCase()) ? 1 : 0;

				span.log({
					input,
					output,
					expected,
					scores: { correctness: score },
					metadata: {
						model: response.model,
						usage: response.usage,
					},
				});

				return { input, output, expected, score };
			});

			results.push(result);
		}

		// Step 5: Get summary
		const summary = await experiment.summarize();

		// Verify results
		expect(results).toHaveLength(2);
		expect(summary).toBeDefined();
		expect(experiment.id).toBeDefined();

		console.log('✅ Complete Logging SDK workflow works with deps.optimizer!');
		console.log(`View results: https://www.braintrust.dev/app/${experiment.project}/experiments/${experiment.id}`);
	}, 20000);

	it('should allow testing custom scoring functions', async () => {
		await login({
			apiKey: env.BRAINTRUST_API_KEY as string,
		});

		const experiment = init({
			project: 'vitest-optimizer-test',
			experiment: `scoring-test-${Date.now()}`,
			apiKey: env.BRAINTRUST_API_KEY as string,
		});

		// Custom scoring function you can unit test
		const customScorer = (output: string, expected: string): number => {
			const outputWords = output.toLowerCase().split(/\s+/);
			const expectedWords = expected.toLowerCase().split(/\s+/);
			const matches = expectedWords.filter((word) => outputWords.includes(word));
			return matches.length / expectedWords.length;
		};

		const result = await experiment.traced(async (span) => {
			const output = 'The quick brown fox';
			const expected = 'quick fox';

			const score = customScorer(output, expected);

			span.log({
				input: 'test',
				output,
				expected,
				scores: { word_overlap: score },
			});

			return score;
		});

		// Test the scorer directly
		expect(result).toBe(1.0); // Both "quick" and "fox" are present

		await experiment.summarize();

		console.log('✅ Custom scoring functions work and are testable!');
	}, 15000);
});
