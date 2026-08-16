import { $ } from "bun";
import type { GitStatus } from "./types";

export async function getGitStatus(cwd: string): Promise<GitStatus | null> {
	try {
		const branchResult = await $`git -C ${cwd} rev-parse --abbrev-ref HEAD`.quiet().nothrow();
		if (branchResult.exitCode !== 0) return null;
		const branch = branchResult.stdout.toString().trim();

		const statusResult = await $`git -C ${cwd} status --porcelain`.quiet().nothrow();
		const dirty = statusResult.stdout.toString().trim().length > 0;

		const diffResult = await $`git -C ${cwd} diff HEAD --shortstat`.quiet().nothrow();
		const diffText = diffResult.stdout.toString();
		const insMatch = diffText.match(/(\d+) insertion/);
		const delMatch = diffText.match(/(\d+) deletion/);
		const insertions = insMatch?.[1] ? Number.parseInt(insMatch[1], 10) : 0;
		const deletions = delMatch?.[1] ? Number.parseInt(delMatch[1], 10) : 0;

		return { branch, dirty, insertions, deletions };
	} catch (err) {
		console.error(`ccstatusline-godlike: git status unavailable for ${cwd} — ${err}`);
		return null;
	}
}
