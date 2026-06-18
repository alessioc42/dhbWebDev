import test from "node:test";
import assert from "node:assert/strict";

import { GameServer } from "../game.js";
import { GameClient } from "../../src/game-client.js";

function wait(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function waitFor(predicate, timeoutMs = 1500) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const value = predicate();
		if (value) {
			return value;
		}

		await wait(20);
	}

	throw new Error("Timed out waiting for condition.");
}

test("creates, joins, lists and pushes through the game client", async (t) => {
	const server = new GameServer();
	const address = await server.listen(0, "127.0.0.1");
	const baseUrl = `http://127.0.0.1:${address.port}`;
	const ownerClient = new GameClient(baseUrl);
	const guestClient = new GameClient(baseUrl);

	t.after(async () => {
		await server.close();
	});

	const created = await ownerClient.createLobby("Alice");
	assert.match(created.lobbyCode, /^[A-Z]{4}$/u);
	assert.equal(created.username, "Alice");

	const joined = await guestClient.joinLobby("Bob", created.lobbyCode);
	assert.equal(joined.lobbyCode, created.lobbyCode);
	assert.equal(joined.username, "Bob");

	const ownerEvents = [];
	const guestEvents = [];
	const ownerStream = await ownerClient.connectLobby({
		lobbyCode: created.lobbyCode,
		userSecret: created.userSecret,
		onEvent(event) {
			ownerEvents.push(event);
		},
	});
	const guestStream = await guestClient.connectLobby({
		lobbyCode: joined.lobbyCode,
		userSecret: joined.userSecret,
		onEvent(event) {
			guestEvents.push(event);
		},
	});

	await waitFor(
		() =>
			ownerEvents.some((event) => event.event === "lobby_state") &&
			guestEvents.some((event) => event.event === "lobby_state"),
	);

	const lobbies = await ownerClient.listLobbies();
	assert.deepEqual(lobbies, {
		lobbies: [
			{
				lobbyCode: created.lobbyCode,
				playerCount: 2,
				owner: "Alice",
			},
		],
	});

	await guestClient.push(joined.userSecret, {
		text: "Hello from Bob",
	});

	await waitFor(
		() =>
			ownerEvents.some(
				(event) => event.event === "push" && event.data.message.text === "Hello from Bob",
			),
	);

	assert.equal(
		guestEvents.some((event) => event.event === "push"),
		false,
		"sender should not receive its own push event",
	);

	guestStream.close();
	await waitFor(() => ownerEvents.some((event) => event.event === "player_left"));

	ownerStream.close();
});

test("game starts on the second join and advances on option selection", async (t) => {
	const server = new GameServer();
	const address = await server.listen(0, "127.0.0.1");
	const baseUrl = `http://127.0.0.1:${address.port}`;
	const ownerClient = new GameClient(baseUrl);
	const guestClient = new GameClient(baseUrl);

	t.after(async () => {
		await server.close();
	});

	const created = await ownerClient.createLobby("Alice");
	const joined = await guestClient.joinLobby("Bob", created.lobbyCode);
	assert.equal(joined.lobbyCode, created.lobbyCode);

	const ownerEvents = [];
	const guestEvents = [];
	const ownerStream = await ownerClient.connectLobby({
		lobbyCode: created.lobbyCode,
		userSecret: created.userSecret,
		onEvent(event) {
			ownerEvents.push(event);
		},
	});
	const guestStream = await guestClient.connectLobby({
		lobbyCode: joined.lobbyCode,
		userSecret: joined.userSecret,
		onEvent(event) {
			guestEvents.push(event);
		},
	});

	await waitFor(
		() =>
			ownerEvents.some((event) => event.event === "game_state") &&
			guestEvents.some((event) => event.event === "game_state"),
	);

	const gameState = ownerEvents.find((event) => event.event === "game_state")?.data;
	assert.equal(gameState.phase, "playing");
	assert.equal(gameState.roundNumber, 1);
	assert.equal(gameState.totalRounds, 11);
	assert.equal(gameState.players.length, 2);
	assert.equal(gameState.options.length, 12);
	assert.equal(new Set(gameState.options.map((option) => option.value)).size, 12);

	let hasWinningSubset = false;
	for (let size = 3; size <= 7 && !hasWinningSubset; size += 1) {
		const pick = [];
		const search = (startIndex) => {
			if (pick.length === size) {
				const sum = pick.reduce((total, option) => total + option.value, 0);
				if (sum === gameState.target) {
					hasWinningSubset = true;
				}
				return;
			}

			for (let index = startIndex; index < gameState.options.length && !hasWinningSubset; index += 1) {
				pick.push(gameState.options[index]);
				search(index + 1);
				pick.pop();
			}
		};

		search(0);
	}
	assert.equal(hasWinningSubset, true);

	const firstOption = gameState.options[0];
	await ownerClient.chooseOption(created.userSecret, firstOption.id);
	await waitFor(() => ownerEvents.some((event) => event.event === "game_state" && event.data.players[0].roundValue !== 0));
	const afterSelect = ownerEvents.filter((event) => event.event === "game_state").at(-1)?.data;
	assert.equal(afterSelect.players.find((player) => player.userSecret === created.userSecret).roundValue, firstOption.value);

	await ownerClient.chooseOption(created.userSecret, firstOption.id);
	await waitFor(() => ownerEvents.filter((event) => event.event === "game_state").at(-1)?.data.players.find((player) => player.userSecret === created.userSecret).roundValue === 0);
	const afterDeselect = ownerEvents.filter((event) => event.event === "game_state").at(-1)?.data;
	assert.equal(afterDeselect.players.find((player) => player.userSecret === created.userSecret).roundValue, 0);

	const solution = [];
	for (let size = 3; size <= 7 && solution.length === 0; size += 1) {
		const pick = [];
		const search = (startIndex) => {
			if (pick.length === size) {
				const sum = pick.reduce((total, option) => total + option.value, 0);
				if (sum === gameState.target) {
					solution.push(...pick);
				}
				return;
			}

			for (let index = startIndex; index < gameState.options.length && solution.length === 0; index += 1) {
				pick.push(gameState.options[index]);
				search(index + 1);
				pick.pop();
			}
		};

		search(0);
	}

	for (const option of solution) {
		await ownerClient.chooseOption(created.userSecret, option.id);
	}

	await waitFor(
		() =>
			ownerEvents.some((event) => event.event === "round_result") &&
			guestEvents.some((event) => event.event === "round_result"),
	);

	const roundResult = ownerEvents.find((event) => event.event === "round_result")?.data;
	assert.equal(roundResult.roundNumber, 1);
	assert.equal(roundResult.winner.username, "Alice");
	assert.equal(roundResult.target, gameState.target);

	await waitFor(
		() =>
			ownerEvents.some(
				(event) => event.event === "game_state" && event.data.roundNumber === 2,
			) &&
			guestEvents.some(
				(event) => event.event === "game_state" && event.data.roundNumber === 2,
			),
	);

	const nextGameState = ownerEvents.find(
		(event) => event.event === "game_state" && event.data.roundNumber === 2,
	)?.data;
	assert.equal(nextGameState.roundNumber, 2);
	assert.equal(nextGameState.players.length, 2);

	guestStream.close();
	ownerStream.close();
});

test("owner disconnect closes the lobby for connected clients", async (t) => {
	const server = new GameServer();
	const address = await server.listen(0, "127.0.0.1");
	const baseUrl = `http://127.0.0.1:${address.port}`;
	const ownerClient = new GameClient(baseUrl);
	const guestClient = new GameClient(baseUrl);

	t.after(async () => {
		await server.close();
	});

	const created = await ownerClient.createLobby("Owner");
	const joined = await guestClient.joinLobby("Guest", created.lobbyCode);

	const guestEvents = [];
	const ownerStream = await ownerClient.connectLobby({
		lobbyCode: created.lobbyCode,
		userSecret: created.userSecret,
	});
	const guestStream = await guestClient.connectLobby({
		lobbyCode: joined.lobbyCode,
		userSecret: joined.userSecret,
		onEvent(event) {
			guestEvents.push(event);
		},
	});

	await waitFor(() => guestEvents.some((event) => event.event === "lobby_state"));

	ownerStream.close();

	await waitFor(() => guestEvents.some((event) => event.event === "lobby_closed"));
	const lobbies = await guestClient.listLobbies();
	assert.deepEqual(lobbies, { lobbies: [] });
	guestStream.close();
});