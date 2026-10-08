import { $ } from "bun";

export interface GitStatus {
	branch: string;
	dirty: boolean;
	insertions: number;
	deletions: number;
}

async function currentBranch(cwd: string): Promise<string | null> {
	const branch = await $`git -C ${cwd} symbolic-ref --short -q HEAD`.quiet().nothrow();
	if (branch.exitCode === 0) return branch.stdout.toString().trim();

	const commit = await $`git -C ${cwd} rev-parse --short HEAD`.quiet().nothrow();

	return commit.exitCode === 0 ? commit.stdout.toString().trim() : null;
}

function changedLines(shortstat: string, kind: "insertion" | "deletion"): number {
	const match = shortstat.match(new RegExp(`(\\d+) ${kind}`));

	return match?.[1] ? Number.parseInt(match[1], 10) : 0;
}

export async function getGitStatus(cwd: string): Promise<GitStatus | null> {
	try {
		const branch = await currentBranch(cwd);
		if (branch === null) return null;

		const [status, diff] = await Promise.all([
			$`git -C ${cwd} --no-optional-locks status --porcelain`.quiet().nothrow(),
			$`git -C ${cwd} --no-optional-locks diff HEAD --shortstat`.quiet().nothrow(),
		]);
		const shortstat = diff.stdout.toString();

		return {
			branch,
			dirty: status.stdout.toString().trim().length > 0,
			insertions: changedLines(shortstat, "insertion"),
			deletions: changedLines(shortstat, "deletion"),
		};
	} catch (err) {
		console.error(`ccwatermelon: git status is unavailable for ${cwd}: ${err}`);
		return null;
	}
}
