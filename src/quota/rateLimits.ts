import { z } from "zod";

const RateLimitWindowSchema = z
	.object({
		used_percentage: z.number().optional().catch(undefined),
		resets_at: z.union([z.number(), z.string()]).nullish().catch(undefined),
	})
	.optional()
	.catch(undefined);

export const RateLimitsSchema = z
	.object({ five_hour: RateLimitWindowSchema, seven_day: RateLimitWindowSchema })
	.optional()
	.catch(undefined);

export type RateLimits = z.infer<typeof RateLimitsSchema>;

export interface UsageLimit {
	utilization: number;
	resets_at: number | null;
}

export interface UsageLimits {
	five_hour: UsageLimit | null;
	seven_day: UsageLimit | null;
}
