import { client } from "../network/client.js";
import { connectSession } from "../network/stream.js";
import { refs } from "../ui/refs.js";
import { renderApp, setFeedback } from "../ui/render/index.js";
import { gameHash } from "./routes.js";
import { clearSession, closeStream, state } from "./state.js";
import { saveSession } from "./storage.js";

function getUsername() {
	return refs.usernameInput.value.trim();
}

export async function handleCreateLobby(event) {
	event.preventDefault();
	const username = getUsername();
	if (!username) {
		setFeedback("lobby", "Enter a name to create a lobby.");
		return;
	}

	try {
		const result = await client.createLobby(username);
		state.session = {
			lobbyCode: result.lobbyCode,
			userSecret: result.userSecret,
			username: result.username,
		};
		saveSession(state.session);
		window.location.hash = gameHash("game");
		state.route = "game";
		setFeedback("game", `Lobby ${result.lobbyCode} created. Waiting for the second player.`);
		renderApp();
		await connectSession();
	} catch (error) {
		setFeedback("lobby", error.message);
	}
}

export async function handleJoinLobby(event) {
	event.preventDefault();
	const username = getUsername();
	const lobbyCode = refs.joinCodeInput.value.trim().toUpperCase();
	if (!username || !lobbyCode) {
		setFeedback("lobby", "Enter a name and lobby code to join.");
		return;
	}

	try {
		const result = await client.joinLobby(username, lobbyCode);
		state.session = {
			lobbyCode: result.lobbyCode,
			userSecret: result.userSecret,
			username: result.username,
		};
		saveSession(state.session);
		window.location.hash = gameHash("game");
		state.route = "game";
		setFeedback("game", `Joined lobby ${result.lobbyCode}.`);
		renderApp();
		await connectSession();
	} catch (error) {
		setFeedback("lobby", error.message);
	}
}

export async function leaveLobby() {
	const userSecret = state.session?.userSecret;
	closeStream();
	if (userSecret) {
		try {
			await client.leave(userSecret);
		} catch {
			// Lobby may already be gone.
		}
	}
	clearSession();
	state.finalizedGameIds.clear();
	state.lastRoundResult = null;
	window.location.hash = gameHash("lobby");
	state.route = "lobby";
	setFeedback("lobby", "Left the lobby.");
}

export function openHighscores() {
	state.route = "highscores";
	window.location.hash = gameHash("highscores");
	renderApp();
}
