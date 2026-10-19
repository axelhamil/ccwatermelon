export interface SegmentToggle {
	enabled?: boolean;
	priority?: number;
}

export type SegmentConfig = Record<string, SegmentToggle>;
