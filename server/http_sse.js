"use strict";

import { createServer } from "node:http";

/** @type {number} */
const DEFAULT_BODY_LIMIT = 1_048_576; // 1 MiB

/** @type {string} */
const DEFAULT_CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

/**
 * @typedef {object} HttpContext
 * @property {import("node:http").IncomingMessage} req
 * @property {import("node:http").ServerResponse} res
 * @property {URL} url
 * @property {Record<string, string>} query
 * @property {(statusCode: number) => HttpContext} status
 * @property {(name: string, value: string | number | readonly string[]) => HttpContext} setHeader
 * @property {(statusCode: number, body: string | Buffer, contentType?: string) => void} send
 * @property {(statusCode: number, payload: unknown) => void} json
 * @property {(limit?: number) => Promise<Buffer>} readBody
 * @property {(limit?: number) => Promise<string>} readText
 * @property {(limit?: number) => Promise<unknown>} readJson
 */

/**
 * @typedef {object} SseMessage
 * @property {string | number} [id]
 * @property {number} [retry]
 * @property {string} [event]
 * @property {unknown} [data]
 */

/**
 * @typedef {object} SseClient
 * @property {number} id
 * @property {import("node:http").IncomingMessage} req
 * @property {(message: SseMessage) => void} send
 * @property {() => void} close
 */

/**
 * @typedef {object} RegisteredRoute
 * @property {string} method
 * @property {string} path
 * @property {(context: HttpContext) => unknown | Promise<unknown>} handler
 */

/**
 * @typedef {object} CorsOptions
 * @property {string} [origin] Allowed origin. Use "*" to allow every destination.
 * @property {string | readonly string[]} [methods] Allowed HTTP methods for CORS preflight.
 * @property {string | readonly string[]} [allowedHeaders] Allowed request headers for CORS preflight.
 * @property {string | readonly string[]} [exposedHeaders] Response headers exposed to browsers.
 * @property {boolean} [credentials] Whether to include Access-Control-Allow-Credentials.
 * @property {number} [maxAge] Access-Control-Max-Age in seconds.
 */

/**
 * @typedef {object} SSECapableServerOptions
 * @property {number} [bodyLimit] Maximum accepted request body in bytes.
 * @property {(context: HttpContext) => void} [notFoundHandler] Handler invoked when no route matches.
 * @property {CorsOptions} [cors] CORS configuration. Defaults to allowing every destination.
 */

/**
 * @typedef {object} NormalizedCorsOptions
 * @property {string} origin
 * @property {string} methods
 * @property {string} allowedHeaders
 * @property {string | null} exposedHeaders
 * @property {boolean} credentials
 * @property {number | null} maxAge
 */

/**
 * Normalizes a potentially missing HTTP method.
 *
 * @param {string | undefined} method
 * @returns {string}
 */
function normalizeMethod(method) {
	return String(method || "GET").toUpperCase();
}

/**
 * Validates and normalizes body size limit.
 *
 * @param {number | undefined} limit
 * @returns {number}
 */
function toBodyLimit(limit) {
	if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
		return DEFAULT_BODY_LIMIT;
	}

	return limit;
}

/**
 * Normalizes a potentially comma-separated header list.
 *
 * @param {string | readonly string[] | undefined} value
 * @param {string} fallback
 * @returns {string}
 */
function toHeaderList(value, fallback) {
	if (Array.isArray(value)) {
		const filtered = value
			.map((entry) => String(entry).trim())
			.filter((entry) => entry.length > 0);

		return filtered.length > 0 ? filtered.join(", ") : fallback;
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : fallback;
	}

	return fallback;
}

/**
 * Produces a normalized CORS policy object.
 *
 * @param {CorsOptions | undefined} cors
 * @returns {NormalizedCorsOptions}
 */
function toCorsOptions(cors) {
	const source = cors || {};
	const origin =
		typeof source.origin === "string" && source.origin.trim().length > 0
			? source.origin.trim()
			: "*";

	const methods = toHeaderList(source.methods, DEFAULT_CORS_METHODS);
	const allowedHeaders = toHeaderList(source.allowedHeaders, "*");
	const exposedHeaders =
		source.exposedHeaders === undefined
			? null
			: toHeaderList(source.exposedHeaders, "");
	const credentials = source.credentials === true;
	const maxAge =
		typeof source.maxAge === "number" &&
		Number.isFinite(source.maxAge) &&
		source.maxAge >= 0
			? Math.floor(source.maxAge)
			: null;

	return {
		origin,
		methods,
		allowedHeaders,
		exposedHeaders: exposedHeaders && exposedHeaders.length > 0 ? exposedHeaders : null,
		credentials,
		maxAge,
	};
}

/**
 * Default handler for unmatched routes.
 *
 * @param {HttpContext} context
 * @returns {void}
 */
function defaultNotFoundHandler(context) {
	context.json(404, { error: "Not Found" });
}

/**
 * Minimal HTTP server with explicit route registration and SSE support.
 */
class SSECapableServer {
	/**
	 * @param {SSECapableServerOptions} [options]
	 */
	constructor(options = {}) {
		/** @type {number} */
		this.bodyLimit = toBodyLimit(options.bodyLimit);
		/** @type {(context: HttpContext) => void} */
		this.notFoundHandler = options.notFoundHandler || defaultNotFoundHandler;
		/** @type {NormalizedCorsOptions} */
		this.cors = toCorsOptions(options.cors);
		/** @type {RegisteredRoute[]} */
		this.routes = [];
		/** @type {Map<string, (client: SseClient, req: import("node:http").IncomingMessage) => void | (() => void)>} */
		this.sseRoutes = new Map();
		/** @type {Set<SseClient>} */
		this.sseClients = new Set();
		/** @type {import("node:http").Server} */
		this.server = createServer(this.#handleRequest.bind(this));
		/** @type {number} */
		this._nextClientId = 1;
	}

	/**
	 * Registers a generic route.
	 *
	 * @param {string} method
	 * @param {string} path
	 * @param {(context: HttpContext) => unknown | Promise<unknown>} handler
	 * @returns {SSECapableServer}
	 */
	route(method, path, handler) {
		if (typeof path !== "string" || path.length === 0) {
			throw new TypeError("Route path must be a non-empty string.");
		}

		if (typeof handler !== "function") {
			throw new TypeError("Route handler must be a function.");
		}

		this.routes.push({
			method: normalizeMethod(method),
			path,
			handler,
		});

		return this;
	}

	/**
	 * Registers a GET route.
	 *
	 * @param {string} path
	 * @param {(context: HttpContext) => unknown | Promise<unknown>} handler
	 * @returns {SSECapableServer}
	 */
	get(path, handler) {
		return this.route("GET", path, handler);
	}

	/**
	 * Registers a POST route.
	 *
	 * @param {string} path
	 * @param {(context: HttpContext) => unknown | Promise<unknown>} handler
	 * @returns {SSECapableServer}
	 */
	post(path, handler) {
		return this.route("POST", path, handler);
	}

	/**
	 * Registers a PUT route.
	 *
	 * @param {string} path
	 * @param {(context: HttpContext) => unknown | Promise<unknown>} handler
	 * @returns {SSECapableServer}
	 */
	put(path, handler) {
		return this.route("PUT", path, handler);
	}

	/**
	 * Registers a PATCH route.
	 *
	 * @param {string} path
	 * @param {(context: HttpContext) => unknown | Promise<unknown>} handler
	 * @returns {SSECapableServer}
	 */
	patch(path, handler) {
		return this.route("PATCH", path, handler);
	}

	/**
	 * Registers a DELETE route.
	 *
	 * @param {string} path
	 * @param {(context: HttpContext) => unknown | Promise<unknown>} handler
	 * @returns {SSECapableServer}
	 */
	delete(path, handler) {
		return this.route("DELETE", path, handler);
	}

	/**
	 * Registers an SSE endpoint.
	 *
	 * @param {string} path
	 * @param {(client: SseClient, req: import("node:http").IncomingMessage) => void | (() => void)} onConnect
	 * @returns {SSECapableServer}
	 */
	sse(path, onConnect) {
		if (typeof path !== "string" || path.length === 0) {
			throw new TypeError("SSE path must be a non-empty string.");
		}

		if (typeof onConnect !== "function") {
			throw new TypeError("SSE onConnect callback must be a function.");
		}

		this.sseRoutes.set(path, onConnect);
		return this;
	}

	/**
	 * Starts the HTTP server.
	 *
	 * @param {number} [port]
	 * @param {string} [host]
	 * @returns {Promise<import("node:net").AddressInfo | string | null>}
	 */
	listen(port = 0, host) {
		return new Promise((resolve, reject) => {
			const onError = (error) => {
				this.server.off("listening", onListening);
				reject(error);
			};

			const onListening = () => {
				this.server.off("error", onError);
				resolve(this.server.address());
			};

			this.server.once("error", onError);
			this.server.once("listening", onListening);
			this.server.listen(port, host);
		});
	}

	/**
	 * Closes all SSE clients and stops the server.
	 *
	 * @returns {Promise<void>}
	 */
	close() {
		for (const client of this.sseClients) {
			client.close();
		}

		return new Promise((resolve, reject) => {
			this.server.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
		});
	}

	/**
	 * Sends an SSE event to all currently connected clients.
	 *
	 * @param {SseMessage} message
	 * @returns {void}
	 */
	broadcast(message) {
		for (const client of this.sseClients) {
			client.send(message);
		}
	}

	/**
	 * Returns current bound address details.
	 *
	 * @returns {import("node:net").AddressInfo | string | null}
	 */
	address() {
		return this.server.address();
	}

	/**
	 * Dispatches an incoming HTTP request to either an SSE endpoint or a regular route.
	 *
	 * @param {import("node:http").IncomingMessage} req
	 * @param {import("node:http").ServerResponse} res
	 * @returns {Promise<void>}
	 */
	async #handleRequest(req, res) {
		const requestUrl = new URL(req.url || "/", "http://localhost");
		const pathname = requestUrl.pathname;
		const method = normalizeMethod(req.method);

		this.#applyCorsHeaders(res);

		if (method === "OPTIONS") {
			res.statusCode = 204;
			res.end();
			return;
		}

		if (method === "GET" && this.sseRoutes.has(pathname)) {
			this.#connectSseClient(pathname, req, res);
			return;
		}

		const route = this.routes.find(
			(candidate) =>
				candidate.method === method && candidate.path === pathname,
		);

		const context = this.#createHttpContext(req, res, requestUrl);

		if (!route) {
			this.notFoundHandler(context);
			return;
		}

		try {
			await route.handler(context);
		} catch (error) {
			if (res.writableEnded) {
				return;
			}

			context.json(500, {
				error: "Internal Server Error",
				details: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Applies CORS headers to a response.
	 *
	 * @param {import("node:http").ServerResponse} res
	 * @returns {void}
	 */
	#applyCorsHeaders(res) {
		res.setHeader("Access-Control-Allow-Origin", this.cors.origin);
		res.setHeader("Access-Control-Allow-Methods", this.cors.methods);
		res.setHeader("Access-Control-Allow-Headers", this.cors.allowedHeaders);

		if (this.cors.exposedHeaders) {
			res.setHeader("Access-Control-Expose-Headers", this.cors.exposedHeaders);
		}

		if (this.cors.credentials) {
			res.setHeader("Access-Control-Allow-Credentials", "true");
		}

		if (this.cors.maxAge !== null) {
			res.setHeader("Access-Control-Max-Age", String(this.cors.maxAge));
		}
	}

	/**
	 * Builds request context helpers passed to route handlers.
	 *
	 * @param {import("node:http").IncomingMessage} req
	 * @param {import("node:http").ServerResponse} res
	 * @param {URL} requestUrl
	 * @returns {HttpContext}
	 */
	#createHttpContext(req, res, requestUrl) {
		/** @type {HttpContext} */
		const ctx = {
			req,
			res,
			url: requestUrl,
			query: Object.fromEntries(requestUrl.searchParams.entries()),
			status(statusCode) {
				res.statusCode = statusCode;
				return ctx;
			},
			setHeader(name, value) {
				res.setHeader(name, value);
				return ctx;
			},
			send(statusCode, body, contentType = "text/plain; charset=utf-8") {
				if (!res.headersSent) {
					res.statusCode = statusCode;
					res.setHeader("Content-Type", contentType);
				}

				res.end(body);
			},
			json(statusCode, payload) {
				ctx.send(
					statusCode,
					JSON.stringify(payload),
					"application/json; charset=utf-8",
				);
			},
			async readBody(limit = this.bodyLimit) {
				const max = toBodyLimit(limit);
				const chunks = [];
				let size = 0;

				for await (const chunk of req) {
					size += chunk.length;
					if (size > max) {
						const error = new Error("Request body exceeds configured limit.");
						error.code = "BODY_TOO_LARGE";
						throw error;
					}

					chunks.push(chunk);
				}

				return Buffer.concat(chunks);
			},
			async readText(limit) {
				const body = await ctx.readBody(limit);
				return body.toString("utf8");
			},
			async readJson(limit) {
				const text = await ctx.readText(limit);
				if (text.length === 0) {
					return null;
				}

				return JSON.parse(text);
			},
		};

		return ctx;
	}

	/**
	 * Accepts and initializes an SSE client connection.
	 *
	 * @param {string} pathname
	 * @param {import("node:http").IncomingMessage} req
	 * @param {import("node:http").ServerResponse} res
	 * @returns {void}
	 */
	#connectSseClient(pathname, req, res) {
		res.statusCode = 200;
		res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
		res.setHeader("Cache-Control", "no-cache, no-transform");
		res.setHeader("Connection", "keep-alive");
		res.setHeader("X-Accel-Buffering", "no");
		res.flushHeaders();
		res.write(": connected\n\n");

		const onConnect = this.sseRoutes.get(pathname);
		const client = this.#createSseClient(req, res);

		this.sseClients.add(client);

		let cleanup;
		try {
			cleanup = onConnect(client, req);
		} catch (error) {
			client.send({
				event: "error",
				data: {
					message: error instanceof Error ? error.message : String(error),
				},
			});
			client.close();
			return;
		}

		const release = () => {
			this.sseClients.delete(client);
			if (typeof cleanup === "function") {
				cleanup();
			}
		};

		req.on("close", release);
		res.on("close", release);
	}

	/**
	 * Creates an SSE client abstraction for a raw HTTP stream.
	 *
	 * @param {import("node:http").IncomingMessage} req
	 * @param {import("node:http").ServerResponse} res
	 * @returns {SseClient}
	 */
	#createSseClient(req, res) {
		const id = this._nextClientId++;

		return {
			id,
			req,
			send(message) {
				if (res.writableEnded || res.destroyed) {
					return;
				}

				res.write(formatSseMessage(message));
			},
			close() {
				if (!res.writableEnded && !res.destroyed) {
					res.end();
				}
			},
		};
	}
}

/**
 * Serializes an object into an SSE-compliant frame payload.
 *
 * @param {SseMessage} [message={}]
 * @returns {string}
 */
function formatSseMessage(message = {}) {
	const lines = [];

	if (message.id !== undefined) {
		lines.push(`id: ${String(message.id)}`);
	}

	if (message.retry !== undefined) {
		lines.push(`retry: ${Number(message.retry)}`);
	}

	if (message.event !== undefined) {
		lines.push(`event: ${String(message.event)}`);
	}

	const payload =
		typeof message.data === "string"
			? message.data
			: JSON.stringify(message.data ?? null);

	for (const line of payload.split(/\r?\n/u)) {
		lines.push(`data: ${line}`);
	}

	return `${lines.join("\n")}\n\n`;
}

export { SSECapableServer, formatSseMessage };
export default SSECapableServer;