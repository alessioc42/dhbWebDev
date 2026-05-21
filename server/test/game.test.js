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