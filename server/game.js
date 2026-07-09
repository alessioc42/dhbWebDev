import { randomInt, randomUUID } from "node:crypto";

import { SSECapableServer } from "./http_sse.js";
import { createStaticFileHandler, resolveStaticRoot } from "./static.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const TOTAL_ROUNDS = 11;
const ROUND_SCORE_BASE = 10;

function isRecord(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function getField(source, ...names) {
	for (const name of names) {
		if (Object.prototype.hasOwnProperty.call(source, name)) {
			return source[name];
		}
	}

	return undefined;
}

function scoreRound(durationMs) {
	const durationSeconds = Math.max(durationMs / 1000, 0.001);
	return Math.round((ROUND_SCORE_BASE / durationSeconds) * 100) / 100;
}

function createDefaultServer() {
	const staticRoot = resolveStaticRoot(import.meta.url);
	if (!staticRoot) {
		return new SSECapableServer();
	}

	return new SSECapableServer({
		notFoundHandler: createStaticFileHandler(staticRoot),
	});
}

class GameServer {
	constructor(server = createDefaultServer()) {
		this.server = server;
		this.lobbies = new Map();
		this.playersBySecret = new Map();

		this.server.post("/create", this.#createLobby.bind(this));
		this.server.post("/join", this.#joinLobby.bind(this));
		this.server.get("/lobbies", this.#listLobbies.bind(this));
		this.server.post("/push", this.#pushMessage.bind(this));
		this.server.post("/choose", this.#chooseOption.bind(this));
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

	#newRound(roundNumber) {
		for (;;) {
			const winningCount = randomInt(3, 8);
			const winningValues = [];
			const usedValues = new Set();
			let target = 0;

			while (winningValues.length < winningCount) {
				let value = 0;
				while (value === 0) {
					value = randomInt(-15, 16);
				}

				if (usedValues.has(value)) {
					continue;
				}

				winningValues.push(value);
				usedValues.add(value);
				target += value;
			}

			if (target < -100 || target > 100) {
				continue;
			}

			const distractorValues = [];
			while (distractorValues.length < 12 - winningCount) {
				const value = randomInt(-100, 101);
				if (value === 0 || value === target || usedValues.has(value)) {
					continue;
				}

				usedValues.add(value);
				distractorValues.push(value);
			}

			const values = [...winningValues, ...distractorValues];
			for (let index = values.length - 1; index > 0; index -= 1) {
				const swapIndex = randomInt(index + 1);
				[values[index], values[swapIndex]] = [values[swapIndex], values[index]];
			}

			return {
				id: randomUUID(),
				roundNumber,
				target,
				startedAt: Date.now(),
				finished: false,
				options: values.map((value) => ({
					id: randomUUID(),
					value,
				})),
				winningCount,
			};
		}
	}

	#serializePlayer(player, lobby) {
		const game = lobby.game;
		return {
			username: player.username,
			userSecret: player.secret,
			isOwner: player.isOwner,
			connected: Boolean(player.client),
			roundValue: game ? game.roundValues.get(player.secret) || 0 : 0,
			totalScore: game ? game.scores.get(player.secret) || 0 : 0,
			selectedOptionIds: game ? [...(game.selections.get(player.secret) || new Set())] : [],
		};
	}

	#serializeGame(lobby) {
		const game = lobby.game;
		if (!game) {
			return null;
		}

		return {
			gameId: game.id,
			phase: game.phase,
			roundNumber: game.roundNumber,
			totalRounds: game.totalRounds,
			target: game.currentRound ? game.currentRound.target : null,
			roundStartedAt: game.currentRound ? game.currentRound.startedAt : null,
			options: game.currentRound
				? game.currentRound.options.map((option) => ({
					id: option.id,
					value: option.value,
				}))
				: [],
			players: [...lobby.players.values()].map((player) => this.#serializePlayer(player, lobby)),
			lastResult: game.lastResult,
			finalResult: game.finalResult,
		};
	}

	#serializeLobby(lobby) {
		return {
			lobbyCode: lobby.code,
			playerCount: lobby.players.size,
			owner: lobby.ownerUsername,
			players: [...lobby.players.values()].map((player) => this.#serializePlayer(player, lobby)),
			game: this.#serializeGame(lobby),
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

	#broadcastLobbyState(lobby) {
		this.#broadcastToLobby(lobby, "lobby_state", this.#serializeLobby(lobby));
	}

	#broadcastGameState(lobby) {
		this.#broadcastToLobby(lobby, "game_state", this.#serializeGame(lobby));
	}

	#ensureGameState(lobby) {
		if (!lobby.game) {
			return null;
		}

		const game = lobby.game;
		for (const player of lobby.players.values()) {
			if (!game.scores.has(player.secret)) {
				game.scores.set(player.secret, 0);
			}
			if (!game.roundValues.has(player.secret)) {
				game.roundValues.set(player.secret, 0);
			}
			if (!game.selections.has(player.secret)) {
				game.selections.set(player.secret, new Set());
			}
		}

		return game;
	}

	#startGame(lobby) {
		const game = {
			id: randomUUID(),
			phase: "playing",
			roundNumber: 1,
			totalRounds: TOTAL_ROUNDS,
			roundValues: new Map(),
			selections: new Map(),
			scores: new Map(),
			currentRound: this.#newRound(1),
			lastResult: null,
			finalResult: null,
		};

		for (const player of lobby.players.values()) {
			game.roundValues.set(player.secret, 0);
			game.selections.set(player.secret, new Set());
			game.scores.set(player.secret, 0);
		}

		lobby.game = game;
		return game;
	}

	#finishRound(lobby, winnerSecret) {
		const game = lobby.game;
		if (!game || game.phase !== "playing" || !game.currentRound || game.currentRound.finished) {
			return;
		}

		const winner = lobby.players.get(winnerSecret);
		if (!winner) {
			return;
		}

		const round = game.currentRound;
		round.finished = true;

		const durationMs = Math.max(1, Date.now() - round.startedAt);
		const roundScore = scoreRound(durationMs);
		game.scores.set(winnerSecret, (game.scores.get(winnerSecret) || 0) + roundScore);

		game.lastResult = {
			lobbyCode: lobby.code,
			gameId: game.id,
			roundNumber: game.roundNumber,
			winner: {
				userSecret: winner.secret,
				username: winner.username,
			},
			target: round.target,
			durationMs,
			durationSeconds: durationMs / 1000,
			roundScore,
			scores: [...lobby.players.values()].map((player) => ({
				userSecret: player.secret,
				username: player.username,
				score: game.scores.get(player.secret) || 0,
			})),
		};

		this.#broadcastToLobby(lobby, "round_result", game.lastResult);

		if (game.roundNumber >= game.totalRounds) {
			game.phase = "finished";
			const finalScores = [...lobby.players.values()]
				.map((player) => ({
					userSecret: player.secret,
					username: player.username,
					score: game.scores.get(player.secret) || 0,
				}))
				.sort((left, right) => right.score - left.score || left.username.localeCompare(right.username));
			const topScore = finalScores[0]?.score ?? 0;
			const topScorers = finalScores.filter((entry) => entry.score === topScore);

			game.finalResult = {
				gameId: game.id,
				lobbyCode: lobby.code,
				finishedAt: new Date().toISOString(),
				scores: finalScores,
				winner: topScorers.length === 1 ? topScorers[0] : null,
			};

			this.#broadcastToLobby(lobby, "game_over", game.finalResult);
			return;
		}

		game.roundNumber += 1;
		game.currentRound = this.#newRound(game.roundNumber);
		for (const player of lobby.players.values()) {
			game.roundValues.set(player.secret, 0);
			game.selections.set(player.secret, new Set());
		}

		this.#broadcastGameState(lobby);
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
				activeClients.push(player.client);
				player.client = null;
			}
		}

		for (const client of activeClients) {
			client.send({
				event: "lobby_closed",
				data: { lobbyCode: lobby.code, reason },
			});
			client.close();
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
		if (lobby.game) {
			lobby.game.roundValues.delete(secret);
			lobby.game.selections.delete(secret);
			lobby.game.scores.delete(secret);
		}

		this.#broadcastToLobby(
			lobby,
			"player_left",
			{
				lobbyCode: lobby.code,
				username: player.username,
				reason,
			},
			secret,
		);
		this.#broadcastLobbyState(lobby);
		if (lobby.game) {
			this.#broadcastGameState(lobby);
		}

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
			game: null,
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
		const lobbyCode = normalizeText(getField(payload, "LOBBY_CODE", "lobbyCode")).toUpperCase();

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

		if (lobby.game?.phase === "finished") {
			this.#sendJsonError(ctx, 409, "Lobby has finished its game.");
			return;
		}

		if (lobby.players.size >= 2) {
			this.#sendJsonError(ctx, 409, "Lobby is full.");
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

		if (lobby.game) {
			this.#ensureGameState(lobby);
			lobby.game.roundValues.set(userSecret, 0);
			lobby.game.selections.set(userSecret, new Set());
			lobby.game.scores.set(userSecret, 0);
		}

		ctx.json(200, {
			lobbyCode,
			userSecret,
			username,
			isOwner: false,
			lobby: this.#serializeLobby(lobby),
		});

		if (lobby.players.size === 2 && !lobby.game) {
			this.#startGame(lobby);
			this.#broadcastLobbyState(lobby);
			this.#broadcastToLobby(lobby, "game_started", this.#serializeGame(lobby));
			this.#broadcastGameState(lobby);
		}
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

		const userSecret = normalizeText(getField(payload, "USER_SECRET", "userSecret"));
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

	async #chooseOption(ctx) {
		const payload = await this.#readJsonObject(ctx);
		if (!payload) {
			return;
		}

		const userSecret = normalizeText(getField(payload, "USER_SECRET", "userSecret"));
		const optionId = normalizeText(getField(payload, "OPTION_ID", "optionId"));

		if (!userSecret) {
			this.#sendJsonError(ctx, 400, "USER_SECRET is required.");
			return;
		}

		if (!optionId) {
			this.#sendJsonError(ctx, 400, "OPTION_ID is required.");
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

		const game = lobby.game;
		if (!game || game.phase !== "playing" || !game.currentRound) {
			this.#sendJsonError(ctx, 409, "Game is not active.");
			return;
		}

		const round = game.currentRound;
		if (round.finished) {
			this.#sendJsonError(ctx, 409, "Round has already finished.");
			return;
		}

		const option = round.options.find((entry) => entry.id === optionId);
		if (!option) {
			this.#sendJsonError(ctx, 404, "Option not found.");
			return;
		}

		const selections = game.selections.get(userSecret) || new Set();
		const wasSelected = selections.has(optionId);
		if (wasSelected) {
			selections.delete(optionId);
		} else {
			selections.add(optionId);
		}
		game.selections.set(userSecret, selections);

		const currentValue = (game.roundValues.get(userSecret) || 0) + (wasSelected ? -option.value : option.value);
		game.roundValues.set(userSecret, currentValue);

		if (currentValue === round.target) {
			this.#finishRound(lobby, userSecret);
		} else {
			this.#broadcastGameState(lobby);
		}

		ctx.json(200, {
			ok: true,
			lobbyCode: lobby.code,
			game: this.#serializeGame(lobby),
		});
	}

	#connectPlayer(client, req) {
		const requestUrl = new URL(req.url || "/", "http://localhost");
		const params = Object.fromEntries(requestUrl.searchParams.entries());
		const lobbyCode = normalizeText(getField(params, "LOBBY_CODE", "lobbyCode")).toUpperCase();
		const userSecret = normalizeText(getField(params, "USER_SECRET", "userSecret"));

		if (!lobbyCode || !userSecret) {
			client.send({ event: "error", data: { message: "LOBBY_CODE and USER_SECRET are required." } });
			client.close();
			return;
		}

		const player = this.playersBySecret.get(userSecret);
		const lobby = this.lobbies.get(lobbyCode);
		if (!player || !lobby || player.lobbyCode !== lobbyCode || lobby.closed) {
			client.send({ event: "error", data: { message: "Lobby or user secret not found." } });
			client.close();
			return;
		}

		player.client = client;
		lobby.players.set(userSecret, player);
		this.#ensureGameState(lobby);

		client.send({ event: "lobby_state", data: this.#serializeLobby(lobby) });
		if (lobby.game) {
			client.send({ event: "game_state", data: this.#serializeGame(lobby) });
		}

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
