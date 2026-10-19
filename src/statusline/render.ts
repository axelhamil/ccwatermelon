import type { SegmentConfig } from "../config/segmentConfig";
import type { ColorName } from "../terminal/format";
import { color, link, tinted } from "../terminal/format";
import { resolveWidth, truncateToWidth, visualWidth } from "../terminal/width";
import type { Clock, PullRequest, ReviewState, StatuslineData } from "./data";
import type { Part } from "./fit";
import { CORE_PRIORITY, flowLines, GAP } from "./fit";
import {
	isEnabled,
	LINKS_SEGMENT,
	MOTION_SEGMENT,
	optionalParts,
	PULL_REQUEST_SEGMENT,
} from "./segments";

const MIN_LABEL_WIDTH = 6;
const BLINK_EVERY_BEATS = 5;

const REVIEW_MARKS: Record<ReviewState, { glyph: string; tone: ColorName }> = {
	approved: { glyph: "✓", tone: "green" },
	pending: { glyph: "●", tone: "yellow" },
	changes_requested: { glyph: "✗", tone: "red" },
	draft: { glyph: "◌", tone: "dim" },
};

function core(text: string): Part {
	return { text, priority: CORE_PRIORITY };
}

function fitName(name: string, room: number): string {
	return truncateToWidth(name, Math.max(MIN_LABEL_WIDTH, room));
}

function pullRequestBadge(pr: PullRequest | null, linked: boolean): string {
	if (pr === null) return "";

	const mark = pr.reviewState ? REVIEW_MARKS[pr.reviewState] : null;
	const badge = tinted(`#${pr.number}${mark ? ` ${mark.glyph}` : ""}`, mark?.tone ?? null);

	return ` ${link(badge, linked ? pr.url : null)}`;
}

function moodPart(d: StatuslineData, clock: Clock): Part {
	const isBlinking = clock.moving && clock.beat % BLINK_EVERY_BEATS === BLINK_EVERY_BEATS - 1;
	const face = color(isBlinking ? d.mood.blink : d.mood.face, d.mood.color);

	return core(d.celebrationMode ? `${face} ✨` : face);
}

function branchPart(
	d: StatuslineData,
	repoUrl: string | null,
	segments: SegmentConfig,
	width: number,
): Part {
	const linked = repoUrl !== null;
	const branchPath = d.git.branch.split("/").map(encodeURIComponent).join("/");
	const branchUrl = linked ? `${repoUrl}/tree/${branchPath}` : null;
	const pullRequest = isEnabled(segments, PULL_REQUEST_SEGMENT.id)
		? pullRequestBadge(d.pullRequest, isEnabled(segments, LINKS_SEGMENT.id))
		: "";
	const dirty = d.git.dirty ? color("*", "yellow") : "";
	const insertions = d.git.insertions > 0 ? ` ${color(`+${d.git.insertions}`, "green")}` : "";
	const deletions = d.git.deletions > 0 ? ` ${color(`-${d.git.deletions}`, "red")}` : "";
	const room = width - MIN_LABEL_WIDTH;
	const extras =
		[`${dirty}${pullRequest}${insertions}${deletions}`, `${dirty}${insertions}${deletions}`].find(
			(candidate) => visualWidth(candidate) <= room,
		) ?? dirty;
	const name = fitName(d.git.branch, width - visualWidth(extras));

	return core(`${link(name, branchUrl)}${extras}`);
}

function modelPart(d: StatuslineData, width: number): Part {
	const contextBadge = /1M/.test(d.modelName) ? color(" 1M", "dim") : "";
	const name = truncateToWidth(
		d.modelName.replace(/\s*\(.*?\)\s*$/, ""),
		width - visualWidth(contextBadge),
	);

	return core(`${name}${contextBadge}`);
}

function identityParts(
	d: StatuslineData,
	clock: Clock,
	segments: SegmentConfig,
	width: number,
): Part[] {
	const repoUrl = isEnabled(segments, LINKS_SEGMENT.id) ? d.repoUrl : null;
	const mood = moodPart(d, clock);
	const dirRoom = width - visualWidth(mood.text) - GAP.length;
	const dir = core(link(fitName(d.dirName, dirRoom), repoUrl));

	return [mood, dir, branchPart(d, repoUrl, segments, width), modelPart(d, width)];
}

export function render(
	d: StatuslineData,
	segments: SegmentConfig = {},
	width: number = resolveWidth(),
	now: number = Date.now(),
): string {
	const moving = isEnabled(segments, MOTION_SEGMENT.id);
	const clock = { now, beat: moving ? Math.floor(now / 1000) : 0, moving };
	const parts = [...identityParts(d, clock, segments, width), ...optionalParts(d, clock, segments)];

	return flowLines(parts, width).join("\n");
}
