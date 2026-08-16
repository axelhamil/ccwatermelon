// Detached cache warmer: fetches the OAuth usage limits and writes them to the
// cache file so the render path only ever does a synchronous read. Never run
// on the render path itself.
import { getUsageLimits } from "./lib/limits";

await getUsageLimits();
