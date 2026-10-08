export interface SegmentToggle {
	enabled?: boolean;
	priority?: number;
	line?: 1 | 2;
}

export type SegmentConfig = Record<string, SegmentToggle>;
