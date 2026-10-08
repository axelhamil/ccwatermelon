const DAY_MINUTES = 1440;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function twoDigits(n: number): string {
	return n.toString().padStart(2, "0");
}

function countdown(totalMinutes: number): string {
	const days = Math.floor(totalMinutes / DAY_MINUTES);
	const hours = Math.floor((totalMinutes % DAY_MINUTES) / 60);
	const minutes = totalMinutes % 60;

	if (days > 0) return `${days}d${hours}h`;
	if (hours > 0) return `${hours}h${twoDigits(minutes)}`;

	return `${minutes}m`;
}

function localClock(resetsAt: number, totalMinutes: number): string {
	const date = new Date(resetsAt * 1000);
	const time = `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;

	const weekday = WEEKDAYS[date.getDay()];

	return totalMinutes >= DAY_MINUTES && weekday ? `${weekday} ${time}` : time;
}

export interface Reset {
	countdown: string;
	clock: string;
}

export function resetOf(resetsAt: number | null, nowMs: number): Reset | null {
	if (resetsAt === null) return null;

	const secondsLeft = resetsAt - nowMs / 1000;
	if (!Number.isFinite(secondsLeft) || secondsLeft <= 0) return null;

	const totalMinutes = Math.ceil(secondsLeft / 60);

	return {
		countdown: `↺${countdown(totalMinutes)}`,
		clock: `(${localClock(resetsAt, totalMinutes)})`,
	};
}
