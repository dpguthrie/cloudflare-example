import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { runExperimentWithDirectAPI } from '../../src/direct-api';

/**
 * PROOF: You CAN directly import and use Braintrust code in Vitest tests
 * when using the direct API approach (no SDK).
 *
 * This is the KEY DIFFERENCE from the SDK approaches:
 * - ❌ import { Eval } from 'braintrust' - DOES NOT work in Vitest
 * - ❌ import { init } from 'braintrust' - DOES NOT work in Vitest
 * - ✅ Direct API calls + OTEL - WORKS in Vitest!
 *
 * This test directly imports runExperimentWithDirectAPI and calls it,
 * proving you can write unit tests that directly test your Braintrust code.
 */
describe('Direct Import of Braintrust Code (NO SDK)', () => {
	it('should be able to directly import and call Braintrust functions', async () => {
		const mockEnv = {
			BRAINTRUST_API_KEY: env.BRAINTRUST_API_KEY as string,
			OPENAI_API_KEY: env.OPENAI_API_KEY as string,
		};

		if (!mockEnv.BRAINTRUST_API_KEY || !mockEnv.OPENAI_API_KEY) {
			console.log('⚠️  Skipping test - missing API keys');
			return;
		}

		// THIS IS THE KEY: We can directly import and call this function
		// No HTTP, no workarounds - just import and call!
		const result = await runExperimentWithDirectAPI(mockEnv);

		expect(result).toBeDefined();
		expect(result.project).toBeDefined();
		expect(result.experiment).toBeDefined();
		expect(result.results).toBeDefined();
		expect(result.results.length).toBe(3);
		expect(result.summary).toBeDefined();
		expect(result.experimentUrl).toBeDefined();

		console.log('✅ Direct import works! No SDK, no workarounds needed!');
		console.log(`View results: ${result.experimentUrl}`);
	}, 20000);
});
