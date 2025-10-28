import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../..');

/**
 * Integration Test Configuration for Braintrust on Cloudflare Workers
 *
 * This configuration uses deps.optimizer to bundle the Braintrust SDK,
 * allowing direct imports of the Logging SDK (init, traced, log, wrapOpenAI)
 * in Vitest tests without any workarounds!
 *
 * Key Settings:
 * - resolve.conditions: Prioritize Node.js exports over browser
 * - deps.optimizer.ssr.include: Bundle Braintrust SDK with esbuild
 *
 * What Works:
 * ✅ Logging SDK (init, traced, log, wrapOpenAI) - Direct imports work!
 * ❌ Eval() - Does not work (browser export issue)
 *
 * References:
 * - https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#module-resolution
 * - https://vitest.dev/config/#deps-optimizer
 */
export default defineWorkersConfig({
	resolve: {
		// Prioritize import/module conditions over browser
		conditions: ['import', 'module', 'node', 'default'],
	},
	test: {
		deps: {
			optimizer: {
				ssr: {
					enabled: true,
					include: [
						// Bundle Braintrust SDK and dependencies
						'braintrust',
						'uuid',
						'@opentelemetry/api',
						'@opentelemetry/sdk-trace-base',
						'@opentelemetry/exporter-trace-otlp-http',
					],
				},
			},
		},
		poolOptions: {
			workers: {
				wrangler: {
					configPath: resolve(projectRoot, 'wrangler.toml'),
				},
			},
		},
	},
});
