import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { Eval, login } from 'braintrust';

/**
 * TEST: Does Eval() now work with the fix?
 *
 * With the conditional CLI dependencies fix:
 * - chalk is optional (fallback for edge)
 * - SimpleProgressReporter used instead of BarProgressReporter in edge
 * - Eval is exported from exports-browser.ts
 *
 * This should NOW WORK!
 */
describe('Eval() with Fixed SDK', () => {
	it('should be able to import and use Eval()', async () => {
		await login({
			apiKey: env.BRAINTRUST_API_KEY as string,
		});

		const result = await Eval('eval-works-test', {
			data: () => [
				{ input: 'What is 2+2?', expected: '4' },
				{ input: 'What is 3+3?', expected: '6' },
			],
			task: async (input: string) => {
				// Simple mock task - just return expected answers
				if (input.includes('2+2')) return '4';
				if (input.includes('3+3')) return '6';
				return 'unknown';
			},
			scores: [
				(output, expected) => ({
					name: 'exact_match',
					score: output === expected.expected ? 1 : 0,
				}),
			],
		});

		expect(result).toBeDefined();
		expect(result.summary).toBeDefined();
		expect(result.results).toBeDefined();
		expect(result.results.length).toBe(2);

		console.log('✅ Eval() works with deps.optimizer after the fix!');
		console.log('Summary:', result.summary);
	}, 30000);

	it('should verify Eval is actually exported', () => {
		// Just verify the import worked
		expect(Eval).toBeDefined();
		expect(typeof Eval).toBe('function');
		console.log('✅ Eval is properly exported from braintrust package');
	});
});
