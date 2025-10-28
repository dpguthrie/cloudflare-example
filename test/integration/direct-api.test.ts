import { describe, it, expect, env as vitestEnv } from 'vitest';
import { env } from 'cloudflare:test';
import { trace } from '@opentelemetry/api';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

/**
 * Test whether we can use Braintrust via direct API calls + OpenTelemetry
 * WITHOUT using the Braintrust SDK at all.
 *
 * This tests: "Can I use Braintrust API + OTEL directly in Vitest tests?"
 *
 * APIs used:
 * - POST /v1/project (get project ID)
 * - POST /v1/experiment (create experiment)
 * - POST /v1/experiment/{id}/insert (insert events)
 * - GET /v1/experiment/{id}/summarize (get summary)
 */
describe('Direct Braintrust API + OpenTelemetry', () => {
	it('should be able to use Braintrust API directly without SDK', async () => {
		const BRAINTRUST_API_URL = 'https://api.braintrust.dev';
		const API_KEY = env.BRAINTRUST_API_KEY as string;

		if (!API_KEY) {
			console.log('⚠️  Skipping test - no BRAINTRUST_API_KEY');
			return;
		}

		// Step 1: Get or create project
		const projectResponse = await fetch(`${BRAINTRUST_API_URL}/v1/project`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				name: 'vitest-direct-api-test',
			}),
		});

		expect(projectResponse.ok).toBe(true);
		const project = await projectResponse.json();
		expect(project.id).toBeDefined();

		// Step 2: Create experiment
		const experimentResponse = await fetch(`${BRAINTRUST_API_URL}/v1/experiment`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				project_id: project.id,
				name: `test-experiment-${Date.now()}`,
			}),
		});

		expect(experimentResponse.ok).toBe(true);
		const experiment = await experimentResponse.json();
		expect(experiment.id).toBeDefined();

		// Step 3: Insert events
		const insertResponse = await fetch(
			`${BRAINTRUST_API_URL}/v1/experiment/${experiment.id}/insert`,
			{
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${API_KEY}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					events: [
						{
							input: 'What is 2+2?',
							output: '4',
							expected: '4',
							scores: {
								correctness: 1,
							},
							metadata: {
								test: 'direct-api',
							},
						},
						{
							input: 'What is the capital of France?',
							output: 'Paris',
							expected: 'Paris',
							scores: {
								correctness: 1,
							},
						},
					],
				}),
			}
		);

		expect(insertResponse.ok).toBe(true);
		const insertResult = await insertResponse.json();
		expect(insertResult.row_ids).toBeDefined();
		expect(insertResult.row_ids.length).toBe(2);

		// Step 4: Summarize experiment
		const summaryResponse = await fetch(
			`${BRAINTRUST_API_URL}/v1/experiment/${experiment.id}/summarize`,
			{
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${API_KEY}`,
				},
			}
		);

		expect(summaryResponse.ok).toBe(true);
		const summary = await summaryResponse.json();
		expect(summary).toBeDefined();

		console.log('✅ Direct API approach works!');
		console.log(`View results: https://www.braintrust.dev/app/${project.name}/experiments/${experiment.id}`);
	}, 15000);

	it('should be able to use OpenTelemetry directly', async () => {
		// Test if OTEL imports work
		const provider = new BasicTracerProvider();
		expect(provider).toBeDefined();

		const tracer = trace.getTracer('test-tracer');
		expect(tracer).toBeDefined();

		// Create a simple span
		const span = tracer.startSpan('test-operation');
		span.setAttribute('test', 'value');
		span.end();

		console.log('✅ OpenTelemetry works in Vitest!');
	});
});
