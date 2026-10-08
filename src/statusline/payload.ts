import { z } from "zod";
import { RateLimitsSchema } from "../quota/rateLimits";

const MAX_PLAUSIBLE_COUNT = 1e12;

const count = z.number().min(0).max(MAX_PLAUSIBLE_COUNT).optional().catch(undefined);
const percentage = z.number().optional().catch(undefined);
const text = z.string().optional().catch(undefined);
const flag = z.boolean().optional().catch(undefined);

const PayloadSchema = z.object({
	session_id: text,
	version: text,
	session_name: text,
	workspace: z
		.object({
			current_dir: text,
			project_dir: text,
			git_worktree: text,
			repo: z.object({ host: text, owner: text, name: text }).optional().catch(undefined),
		})
		.optional()
		.catch(undefined),
	model: z.object({ display_name: text }).optional().catch(undefined),
	output_style: z.object({ name: text }).optional().catch(undefined),
	vim: z.object({ mode: text }).optional().catch(undefined),
	agent: z.object({ name: text }).optional().catch(undefined),
	effort: z.object({ level: text }).optional().catch(undefined),
	thinking: z.object({ enabled: flag }).optional().catch(undefined),
	fast_mode: flag,
	pr: z
		.object({
			number: z.number().int().positive().optional().catch(undefined),
			url: text,
			review_state: z
				.enum(["approved", "pending", "changes_requested", "draft"])
				.optional()
				.catch(undefined),
		})
		.optional()
		.catch(undefined),
	rate_limits: RateLimitsSchema,
	cost: z
		.object({
			total_cost_usd: count,
			total_duration_ms: count,
			total_lines_added: count,
			total_lines_removed: count,
		})
		.optional()
		.catch(undefined),
	context_window: z
		.object({
			current_usage: z
				.object({
					input_tokens: count,
					cache_creation_input_tokens: count,
					cache_read_input_tokens: count,
				})
				.optional()
				.catch(undefined),
			used_percentage: percentage,
			context_window_size: count,
		})
		.optional()
		.catch(undefined),
});

export type Payload = z.infer<typeof PayloadSchema>;

export function parsePayload(raw: unknown): Payload | null {
	const parsed = PayloadSchema.safeParse(raw);

	return parsed.success ? parsed.data : null;
}
