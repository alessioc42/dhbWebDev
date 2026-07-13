const textDecoder = new TextDecoder();

function parseJsonMaybe(value) {
	if (value === "") {
		return "";
	}

	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

class GameClient {
	constructor(baseUrl = globalThis.location?.origin || "http://127.0.0.1:3000", options = {}) {
		if (!options.fetchImpl && typeof fetch !== "function") {
			throw new Error("A fetch implementation is required.");
		}

		this.baseUrl = baseUrl;
		this.fetch = options.fetchImpl || fetch.bind(globalThis);
	}

	#url(pathname) {
		return new URL(pathname, this.baseUrl);
	}

	async #request(pathname, init = {}) {
		const response = await this.fetch(this.#url(pathname), init);
		const text = await response.text();
		let payload = null;

		if (text) {
			payload = JSON.parse(text);
		}

		if (!response.ok) {
			const error = new Error(payload?.error || response.statusText || "Request failed.");
			error.status = response.status;
			error.payload = payload;
			throw error;
		}

		return payload;
	}

	createLobby(username) {
		return this.#request("/create", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ USERNAME: username }),
		});
	}

	joinLobby(username, lobbyCode) {
		return this.#request("/join", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ USERNAME: username, LOBBY_CODE: lobbyCode }),
		});
	}

	listLobbies() {
		return this.#request("/lobbies");
	}

	push(userSecret, message) {
		return this.#request("/push", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ USER_SECRET: userSecret, MESSAGE: message }),
		});
	}

	chooseOption(userSecret, optionId) {
		return this.#request("/choose", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ USER_SECRET: userSecret, OPTION_ID: optionId }),
		});
	}

	leave(userSecret) {
		return this.#request("/leave", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ USER_SECRET: userSecret }),
		});
	}

	async connectLobby({ lobbyCode, userSecret, onEvent } = {}) {
		const url = this.#url("/events");
		if (lobbyCode) {
			url.searchParams.set("LOBBY_CODE", lobbyCode);
		}
		if (userSecret) {
			url.searchParams.set("USER_SECRET", userSecret);
		}

		const controller = new AbortController();
		const response = await this.fetch(url, {
			headers: { Accept: "text/event-stream" },
			signal: controller.signal,
		});

		if (!response.ok || !response.body) {
			const text = await response.text();
			throw new Error(text || response.statusText || "Unable to open lobby stream.");
		}

		const reader = response.body.getReader();
		const events = [];
		let buffer = "";
		let closed = false;

		const parseFrame = (frame) => {
			let event = "message";
			let id;
			let retry;
			const dataLines = [];
			let hasField = false;

			for (const rawLine of frame.split(/\r?\n/u)) {
				if (!rawLine || rawLine.startsWith(":")) {
					continue;
				}

				const separatorIndex = rawLine.indexOf(":");
				const field = separatorIndex === -1 ? rawLine : rawLine.slice(0, separatorIndex);
				let value = separatorIndex === -1 ? "" : rawLine.slice(separatorIndex + 1);
				if (value.startsWith(" ")) {
					value = value.slice(1);
				}

				hasField = true;

				switch (field) {
					case "event":
						event = value || "message";
						break;
					case "id":
						id = value;
						break;
					case "retry":
						retry = Number(value);
						break;
					case "data":
						dataLines.push(value);
						break;
					default:
						break;
				}
			}

			if (!hasField && dataLines.length === 0 && event === "message") {
				return null;
			}

			const rawData = dataLines.join("\n");
			return {
				event,
				id,
				retry,
				data: parseJsonMaybe(rawData),
			};
		};

		const done = (async () => {
			try {
				while (true) {
					const { done: streamDone, value } = await reader.read();
					if (streamDone) {
						break;
					}

					buffer += textDecoder.decode(value, { stream: true });
					while (true) {
						const frameEnd = buffer.indexOf("\n\n");
						if (frameEnd === -1) {
							break;
						}

						const frame = buffer.slice(0, frameEnd);
						buffer = buffer.slice(frameEnd + 2);
						const parsed = parseFrame(frame);
						if (parsed) {
							events.push(parsed);
							if (typeof onEvent === "function") {
								onEvent(parsed);
							}
						}
					}
				}

				buffer += textDecoder.decode();
				const parsed = parseFrame(buffer);
				if (parsed) {
					events.push(parsed);
					if (typeof onEvent === "function") {
						onEvent(parsed);
					}
				}
			} catch (error) {
				if (error?.name !== "AbortError" && error?.code !== "ABORT_ERR") {
					throw error;
				}
			} finally {
				closed = true;
				controller.abort();
			}
		})();

		return {
			response,
			events,
			done,
			close() {
				if (!closed) {
					closed = true;
					controller.abort();
				}
			},
		};
	}
}

export { GameClient };
export default GameClient;