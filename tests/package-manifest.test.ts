import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJsonUrl = new URL("../package.json", import.meta.url);

test("runtime Pi core imports are declared as peers", async () => {
	const pkg = JSON.parse(await readFile(packageJsonUrl, "utf8")) as {
		peerDependencies?: Record<string, string>;
	};

	assert.equal(pkg.peerDependencies?.["@earendil-works/pi-tui"], "*");
});
