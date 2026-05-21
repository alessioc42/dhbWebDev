import { randomInt, randomUUID } from "node:crypto";

import { SSECapableServer } from "./http_sse.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function isRecord(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
	if (typeof value !== "string") {
		return "";
	}

	return value.trim();
}

function getField(source, ...names) {
	for (const name of names) {
		if (!Object.prototype.hasOwnProperty.call(source, name)) {
			continue;
		}

		return source[name];
	}

	return undefined;
}

class GameServer {
	constructor(server = new SSECapableServer()) {
		this.server = server;
		this.lobbies = new Map();
		this.playersBySecret = new Map();

		this.server.post("/create", this.#createLobby.bind(this));
		this.server.post("/join", this.#joinLobby.bind(this));
		this.server.get("/lobbies", this.#listLobbies.bind(this));
		this.server.post("/push", this.#pushMessage.bind(this));
		this.server.sse("/events", this.#connectPlayer.bind(this));
	}

	listen(port = 0, host) {
		return this.server.listen(port, host);
	}

	close() {
		return this.server.close();
	}

	address() {
		return this.server.address();
	}

	#newLobbyCode() {
		for (;;) {
			let code = "";
			for (let index = 0; index < 4; index += 1) {
				code += ALPHABET[randomInt(ALPHABET.length)];
			}

			if (!this.lobbies.has(code)) {
				return code;
			}
		}
	}

	#newSecret() {
		return randomUUID();
	}

	#serializePlayer(player) {
		return {
			username: player.username,
			userSecret: player.secret,
			isOwner: player.isOwner,
			connected: Boolean(player.client),
		};
	}

	#serializeLobby(lobby) {
		return {
			lobbyCode: lobby.code,
			playerCount: lobby.players.size,
			owner: lobby.ownerUsername,
			players: [...lobby.players.values()].map((player) =>
				this.#serializePlayer(player),
			),
		};
	}

	#sendJsonError(ctx, statusCode, message) {
		ctx.json(statusCode, { error: message });
	}

	async #readJsonObject(ctx) {
		try {
			const payload = await ctx.readJson();
			return isRecord(payload) ? payload : {};
		} catch (error) {
			if (error instanceof SyntaxError) {
				this.#sendJsonError(ctx, 400, "Invalid JSON payload.");
				return null;
			}

			throw error;
		}
	}

	#broadcastToLobby(lobby, event, data, exceptSecret) {
		for (const player of lobby.players.values()) {
			if (player.secret === exceptSecret || !player.client) {
				continue;
			}

			player.client.send({ event, data });
		}
	}

	#closeLobby(lobby, reason) {
		if (!lobby || lobby.closed) {
			return;
		}

		lobby.closed = true;
		this.lobbies.delete(lobby.code);

		const activeClients = [];
		for (const player of lobby.players.values()) {
			this.playersBySecret.delete(player.secret);
			if (player.client) {
				activeClients.push({ client: player.client });
				player.client = null;
			}
		}

		for (const entry of activeClients) {
			entry.client.send({
				event: "lobby_closed",
				data: {
					lobbyCode: lobby.code,
					reason,
				},
			});
		}

		for (const entry of activeClients) {
			entry.client.close();
		}
	}

	#disconnectPlayer(secret, reason = "disconnect") {
		const player = this.playersBySecret.get(secret);
		if (!player) {
			return;
		}

		const lobby = this.lobbies.get(player.lobbyCode);
		this.playersBySecret.delete(secret);

		if (!lobby || lobby.closed) {
			return;
		}

		player.client = null;

		if (player.isOwner) {
			this.#closeLobby(lobby, reason);
			return;
		}

		lobby.players.delete(secret);
		this.#broadcastToLobby(lobby, "player_left", {
			lobbyCode: lobby.code,
			username: player.username,
			reason,
		});

		if (lobby.players.size === 0) {
			this.lobbies.delete(lobby.code);
		}
	}

	async #createLobby(ctx) {
		const payload = await this.#readJsonObject(ctx);
		if (!payload) {
			return;
		}

		const username = normalizeText(getField(payload, "USERNAME", "username"));
		if (!username) {
			this.#sendJsonError(ctx, 400, "USERNAME is required.");
			return;
		}

		const lobbyCode = this.#newLobbyCode();
		const userSecret = this.#newSecret();
		const lobby = {
			code: lobbyCode,
			ownerSecret: userSecret,
			ownerUsername: username,
			players: new Map(),
			closed: false,
		};

		const player = {
			lobbyCode,
			username,
			secret: userSecret,
			isOwner: true,
			client: null,
		};

		lobby.players.set(userSecret, player);
		this.lobbies.set(lobbyCode, lobby);
		this.playersBySecret.set(userSecret, player);

		ctx.json(201, {
			lobbyCode,
			userSecret,
			username,
			isOwner: true,
			lobby: this.#serializeLobby(lobby),
		});
	}

	async #joinLobby(ctx) {
		const payload = await this.#readJsonObject(ctx);
		if (!payload) {
			return;
		}

		const username = normalizeText(getField(payload, "USERNAME", "username"));
		const lobbyCode = normalizeText(
			getField(payload, "LOBBY_CODE", "lobbyCode"),
		).toUpperCase();

		if (!username) {
			this.#sendJsonError(ctx, 400, "USERNAME is required.");
			return;
		}

		if (!lobbyCode) {
			this.#sendJsonError(ctx, 400, "LOBBY_CODE is required.");
			return;
		}

		const lobby = this.lobbies.get(lobbyCode);
		if (!lobby || lobby.closed) {
			this.#sendJsonError(ctx, 404, "Lobby not found.");
			return;
		}

		const userSecret = this.#newSecret();
		const player = {
			lobbyCode,
			username,
			secret: userSecret,
			isOwner: false,
			client: null,
		};

		lobby.players.set(userSecret, player);
		this.playersBySecret.set(userSecret, player);

		ctx.json(200, {
			lobbyCode,
			userSecret,
			username,
			isOwner: false,
			lobby: this.#serializeLobby(lobby),
		});
	}

	async #listLobbies(ctx) {
		ctx.json(200, {
			lobbies: [...this.lobbies.values()].map((lobby) => ({
				lobbyCode: lobby.code,
				playerCount: lobby.players.size,
				owner: lobby.ownerUsername,
			})),
		});
	}

	async #pushMessage(ctx) {
		const payload = await this.#readJsonObject(ctx);
		if (!payload) {
			return;
		}

		const userSecret = normalizeText(
			getField(payload, "USER_SECRET", "userSecret"),
		);
		const message = getField(payload, "MESSAGE", "message");

		if (!userSecret) {
			this.#sendJsonError(ctx, 400, "USER_SECRET is required.");
			return;
		}

		const player = this.playersBySecret.get(userSecret);
		if (!player) {
			this.#sendJsonError(ctx, 401, "Invalid user secret.");
			return;
		}

		const lobby = this.lobbies.get(player.lobbyCode);
		if (!lobby || lobby.closed) {
			this.#sendJsonError(ctx, 404, "Lobby not found.");
			return;
		}

		this.#broadcastToLobby(
			lobby,
			"push",
			{
				lobbyCode: lobby.code,
				username: player.username,
				userSecret,
				message,
			},
			userSecret,
		);

		ctx.json(200, {
			ok: true,
			lobbyCode: lobby.code,
			username: player.username,
		});
	}

	#connectPlayer(client, req) {
		const requestUrl = new URL(req.url || "/", "http://localhost");
		const params = Object.fromEntries(requestUrl.searchParams.entries());
		const lobbyCode = normalizeText(getField(params, "LOBBY_CODE", "lobbyCode")).toUpperCase();
		const userSecret = normalizeText(getField(params, "USER_SECRET", "userSecret"));

		if (!lobbyCode || !userSecret) {
			client.send({
				event: "error",
				data: { message: "LOBBY_CODE and USER_SECRET are required." },
			});
			client.close();
			return;
		}

		const player = this.playersBySecret.get(userSecret);
		const lobby = this.lobbies.get(lobbyCode);
		if (!player || !lobby || player.lobbyCode !== lobbyCode || lobby.closed) {
			client.send({
				event: "error",
				data: { message: "Lobby or user secret not found." },
			});
			client.close();
			return;
		}

		player.client = client;
		lobby.players.set(userSecret, player);

		client.send({
			event: "lobby_state",
			data: this.#serializeLobby(lobby),
		});

		this.#broadcastToLobby(
			lobby,
			"player_joined",
			{
				lobbyCode: lobby.code,
				username: player.username,
				userSecret,
			},
			userSecret,
		);

		return () => {
			this.#disconnectPlayer(userSecret, "disconnect");
		};
	}
}

export { GameServer };
export default GameServer;