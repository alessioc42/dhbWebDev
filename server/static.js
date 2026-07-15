"use strict";

import { createReadStream, existsSync, statSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {Record<string, string>} */
const MIME_TYPES = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".txt": "text/plain; charset=utf-8",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

/**
 * Resolves the directory that contains the frontend entrypoint.
 *
 * @param {string} [moduleUrl=import.meta.url]
 * @returns {string | null}
 */
export function resolveStaticRoot(moduleUrl = import.meta.url) {
	if (process.env.STATIC_ROOT) {
		return resolve(process.env.STATIC_ROOT);
	}

	const moduleDir = dirname(fileURLToPath(moduleUrl));
	const candidates = [moduleDir, join(moduleDir, "..")];

	for (const candidate of candidates) {
		if (existsSync(join(candidate, "index.html"))) {
			return resolve(candidate);
		}
	}

	return null;
}

/**
 * @param {string} rootDir
 * @param {string} requestPath
 * @returns {string | null}
 */
function resolveStaticFile(rootDir, requestPath) {
	const normalizedRoot = resolve(rootDir);
	let pathname = decodeURIComponent(requestPath);

	if (pathname === "/") {
		pathname = "/index.html";
	}

	const relativePath = pathname.replace(/^\/+/u, "");
	if (!relativePath || relativePath.includes("..")) {
		return null;
	}

	const filePath = resolve(normalizedRoot, relativePath);
	if (filePath === normalizedRoot || !filePath.startsWith(`${normalizedRoot}${sep}`)) {
		return null;
	}

	if (!existsSync(filePath)) {
		return null;
	}

	const stats = statSync(filePath);
	if (!stats.isFile()) {
		return null;
	}

	return filePath;
}

/**
 * Creates a fallback handler that serves static frontend assets.
 *
 * @param {string} rootDir
 * @param {{ indexFile?: string }} [options]
 * @returns {(context: import("./http_sse.js").HttpContext) => void}
 */
export function createStaticFileHandler(rootDir, options = {}) {
	const normalizedRoot = resolve(rootDir);
	const indexFile = options.indexFile || "index.html";

	return (context) => {
		if (context.req.method !== "GET" && context.req.method !== "HEAD") {
			context.json(404, { error: "Not Found" });
			return;
		}

		let filePath = resolveStaticFile(normalizedRoot, context.url.pathname);
		if (!filePath && !context.url.pathname.includes(".")) {
			filePath = resolveStaticFile(normalizedRoot, `/${indexFile}`);
		}

		if (!filePath) {
			context.json(404, { error: "Not Found" });
			return;
		}

		const contentType = MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
		const extension = extname(filePath).toLowerCase();
		const cacheableAsset = extension === ".woff" || extension === ".woff2" || extension === ".ico";
		const cacheControl =
			process.env.NODE_ENV === "production" && cacheableAsset
				? "public, max-age=3600"
				: "no-cache";

		context.status(200);
		context.setHeader("Content-Type", contentType);
		context.setHeader("Cache-Control", cacheControl);

		if (context.req.method === "HEAD") {
			context.res.end();
			return;
		}

		createReadStream(filePath).pipe(context.res);
	};
}
