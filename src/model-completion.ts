import * as piAi from "@earendil-works/pi-ai";
import type { complete as completeCompat } from "@earendil-works/pi-ai/compat";

// Earlier Pi versions expose complete at the root and have no /compat entry point.
export const complete: typeof completeCompat = async (...args) => {
	const api = "complete" in piAi ? piAi as { complete: typeof completeCompat } : await import("@earendil-works/pi-ai/compat");
	return api.complete(...args);
};
