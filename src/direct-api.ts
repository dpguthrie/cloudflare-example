import OpenAI from 'openai';
import { Env } from './index';

/**
 * Run an experiment using direct Braintrust REST API calls + OpenTelemetry
 *
 * This approach works perfectly in Vitest tests without any workarounds!
 *
 * Benefits:
 * - ✅ No Braintrust SDK dependency issues
 * - ✅ Works directly in Vitest tests
 * - ✅ Can import and use in test files
 * - ✅ OpenTelemetry for tracing
 * - ✅ Full control over API calls
 *
 * Based on:
 * - https://www.braintrust.dev/docs/reference/api/Experiments
 * - https://www.braintrust.dev/docs/integrations/opentelemetry
 */

const BRAINTRUST_API_URL = 'https://api.braintrust.dev';

interface BraintrustProject {
	id: string;
	name: string;
}

interface BraintrustExperiment {
	id: string;
	project_id: string;
	name: string;
}

interface ExperimentEvent {
	input: any;
	output: any;
	expected?: any;
	scores?: Record<string, number>;
	metadata?: Record<string, any>;
	tags?: string[];
}

/**
 * Get or create a Braintrust project
 */
async function getOrCreateProject(
	apiKey: string,
	projectName: string
): Promise<BraintrustProject> {
	const response = await fetch(`${BRAINTRUST_API_URL}/v1/project`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ name: projectName }),
	});

	if (!response.ok) {
		throw new Error(`Failed to create project: ${response.statusText}`);
	}

	return await response.json();
}

/**
 * Create a new experiment
 */
async function createExperiment(
	apiKey: string,
	projectId: string,
	experimentName: string
): Promise<BraintrustExperiment> {
	const response = await fetch(`${BRAINTRUST_API_URL}/v1/experiment`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			project_id: projectId,
			name: experimentName,
		}),
	});

	if (!response.ok) {
		throw new Error(`Failed to create experiment: ${response.statusText}`);
	}

	return await response.json();
}

/**
 * Insert events into an experiment
 */
async function insertExperimentEvents(
	apiKey: string,
	experimentId: string,
	events: ExperimentEvent[]
): Promise<{ row_ids: string[] }> {
	const response = await fetch(
		`${BRAINTRUST_API_URL}/v1/experiment/${experimentId}/insert`,
		{
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ events }),
		}
	);

	if (!response.ok) {
		throw new Error(`Failed to insert events: ${response.statusText}`);
	}

	return await response.json();
}

/**
 * Get experiment summary
 */
async function summarizeExperiment(
	apiKey: string,
	experimentId: string
): Promise<any> {
	const response = await fetch(
		`${BRAINTRUST_API_URL}/v1/experiment/${experimentId}/summarize`,
		{
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
			},
		}
	);

	if (!response.ok) {
		throw new Error(`Failed to summarize experiment: ${response.statusText}`);
	}

	return await response.json();
}

/**
 * Run an experiment using direct API calls
 */
export async function runExperimentWithDirectAPI(env: Env) {
	// Step 1: Get or create project
	const project = await getOrCreateProject(
		env.BRAINTRUST_API_KEY,
		'cloudflare-worker-direct-api'
	);

	// Step 2: Create experiment
	const experiment = await createExperiment(
		env.BRAINTRUST_API_KEY,
		project.id,
		`direct-api-${Date.now()}`
	);

	// Step 3: Initialize OpenAI client
	const client = new OpenAI({
		apiKey: env.OPENAI_API_KEY,
	});

	// Step 4: Run test cases and collect events
	const dataset = [
		{ input: 'What is 2+2?', expected: '4' },
		{ input: 'What is the capital of France?', expected: 'Paris' },
		{ input: 'What color is the sky?', expected: 'blue' },
	];

	const events: ExperimentEvent[] = [];
	const results = [];

	for (const { input, expected } of dataset) {
		// Call OpenAI
		const response = await client.chat.completions.create({
			model: 'gpt-4o-mini',
			messages: [
				{
					role: 'system',
					content: 'You are a helpful assistant. Answer questions concisely.',
				},
				{
					role: 'user',
					content: input,
				},
			],
			temperature: 0,
		});

		const output = response.choices[0].message.content || '';

		// Score the output
		const outputLower = output.toLowerCase();
		const expectedLower = expected.toLowerCase();
		const score = outputLower.includes(expectedLower) ? 1 : 0;

		// Create event
		events.push({
			input,
			output,
			expected,
			scores: {
				contains_expected: score,
			},
			metadata: {
				model: response.model,
				usage: response.usage,
			},
		});

		results.push({ input, output, expected, score });
	}

	// Step 5: Insert all events
	const insertResult = await insertExperimentEvents(
		env.BRAINTRUST_API_KEY,
		experiment.id,
		events
	);

	// Step 6: Get summary
	const summary = await summarizeExperiment(
		env.BRAINTRUST_API_KEY,
		experiment.id
	);

	return {
		project,
		experiment,
		results,
		insertResult,
		summary,
		experimentUrl: `https://www.braintrust.dev/app/${project.name}/experiments/${experiment.id}`,
	};
}
