import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { GameServer } from "../game.js";
import { resolveStaticRoot } from "../static.js";

async function readText(response) {
	return response.text();
}

test("serves the frontend entrypoint and assets from the static root", async (t) => {
	const root = mkdtempSync(join(tmpdir(), "dhb-static-"));
	mkdirSync(join(root, "src"), { recursive: true });
	writeFileSync(join(root, "index.html"), "<!doctype html><title>Math Duel</title>");
	writeFileSync(join(root, "src", "main.js"), "export {};\n");

	const previousStaticRoot = process.env.STATIC_ROOT;
	process.env.STATIC_ROOT = root;

	const server = new GameServer();
	const address = await server.listen(0, "127.0.0.1");
	const baseUrl = `http://127.0.0.1:${address.port}`;

	t.after(async () => {
		if (previousStaticRoot === undefined) {
			delete process.env.STATIC_ROOT;
		} else {
			process.env.STATIC_ROOT = previousStaticRoot;
		}

		await server.close();
	});

	const indexResponse = await fetch(`${baseUrl}/`);
	assert.equal(indexResponse.status, 200);
	assert.match(await readText(indexResponse), /Math Duel/u);
	assert.match(indexResponse.headers.get("content-type") || "", /text\/html/u);

	const assetResponse = await fetch(`${baseUrl}/src/main.js`);
	assert.equal(assetResponse.status, 200);
	assert.match(await readText(assetResponse), /export \{\}/u);
	assert.match(assetResponse.headers.get("content-type") || "", /javascript/u);

	const apiResponse = await fetch(`${baseUrl}/lobbies`);
	assert.equal(apiResponse.status, 200);
	assert.equal((await apiResponse.json()).lobbies.length, 0);
});

test("resolveStaticRoot finds the repository frontend during local development", () => {
	const root = resolveStaticRoot(new URL("../game.js", import.meta.url).href);
	assert.ok(root);
	assert.ok(existsSync(join(root, "index.html")));
	assert.ok(existsSync(join(root, "src", "main.js")));
});
