import { readFileSync } from "node:fs";
import type { z } from "zod";

export function readJsonFile<T>(path: string, schema: z.ZodType<T>, label: string): T | null {
	try {
		const parsed = schema.safeParse(JSON.parse(readFileSync(path, "utf-8")));
		if (parsed.success) return parsed.data;

		const issues = parsed.error.issues.map((issue) => issue.message).join(", ");
		console.error(`ccwatermelon: ${label} at ${path} has an unexpected shape: ${issues}`);
		return null;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;

		console.error(`ccwatermelon: ${label} at ${path} is unreadable: ${err}`);
		return null;
	}
}
