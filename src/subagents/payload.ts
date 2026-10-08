import { z } from "zod";

const text = z.string().optional().catch(undefined);
const amount = z.number().min(0).optional().catch(undefined);

const SubagentTaskSchema = z.object({
	id: z.string().min(1),
	name: text,
	agentType: text,
	status: text,
	description: text,
	label: text,
	model: text,
	startTime: amount,
	tokenCount: amount,
	tokenSamples: z.array(z.number().min(0)).optional().catch(undefined),
});

const SubagentPayloadSchema = z.object({
	cwd: text,
	columns: z.number().min(1).optional().catch(undefined),
	tasks: z
		.array(SubagentTaskSchema.nullable().catch(null))
		.catch([])
		.transform((tasks) => tasks.filter((task) => task !== null)),
});

export type SubagentTask = z.infer<typeof SubagentTaskSchema>;
export type SubagentPayload = z.infer<typeof SubagentPayloadSchema>;

export function parseSubagentPayload(raw: unknown): SubagentPayload | null {
	const parsed = SubagentPayloadSchema.safeParse(raw);

	return parsed.success ? parsed.data : null;
}
