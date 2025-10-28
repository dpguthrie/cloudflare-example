import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../..');

/**
 * Integration Test Configuration for Braintrust on Cloudflare Workers
 *
 * This config uses the wrangler build workaround to test against compiled output
 * instead of importing the Braintrust SDK directly in tests.
 *
 * Based on: https://github.com/cloudflare/workers-sdk/issues/7324
 *
 * Why: Vitest's Workers integration doesn't provide all Node.js modules that
 * Braintrust SDK requires (node:os, node:child_process, etc.). By using
 * wrangler's built output, we get all polyfills that production uses.
 *
 * To run these tests:
 * 1. npm run build:test  (builds with wrangler)
 * 2. npm run test:integration
 */
export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: {
					configPath: resolve(projectRoot, 'wrangler.toml'),
				},
				// Point to wrangler's built output (includes all polyfills)
				main: resolve(projectRoot, '.wrangler-test-build/index.js'),
			},
		},
	},
});
