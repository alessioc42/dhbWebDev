import { client } from "../network/client.js";
import { connectSession } from "../network/stream.js";
import { readCreateLobbySettings } from "../game-settings.js";
import { refs } from "../ui/refs.js";
import { canCreateLobby, canJoinLobby } from "../ui/render/lobby.js";
import { renderApp, setFeedback } from "../ui/render/index.js";
import { gameHash } from "./routes.js";
import { clearSession, closeStream, state } from "./state.js";
import { saveSession } from "./storage.js";

function getUsername() {
	return refs.usernameInput.value.trim();
}

export async function handleCreateLobby(event) {
	event.preventDefault();
	if (!canCreateLobby()) {
		return;
	}

	const username = getUsername();
	state.lobbyBusy = true;
	renderApp();

	try {
		const settings = readCreateLobbySettings(refs);
		const result = await client.createLobby(username, settings);
		state.session = {
			lobbyCode: result.lobbyCode,
			userSecret: result.userSecret,
			username: result.username,
		};
		saveSession(state.session);
		window.location.hash = gameHash("game");
		state.route = "game";
		setFeedback("game", `Lobby ${result.lobbyCode} erstellt. Warte auf den zweiten Spieler.`);
		renderApp();
		await connectSession();
	} catch (error) {
		setFeedback("lobby", error.message);
	} finally {
		state.lobbyBusy = false;
		renderApp();
	}
}

export async function handleJoinLobby(event) {
	event.preventDefault();
	if (!canJoinLobby()) {
		return;
	}

	const username = getUsername();
	const lobbyCode = refs.joinCodeInput.value.trim().toUpperCase();
	state.lobbyBusy = true;
	renderApp();

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
		setFeedback("game", `Lobby ${result.lobbyCode} beigetreten.`);
		renderApp();
		await connectSession();
	} catch (error) {
		setFeedback("lobby", error.message);
	} finally {
		state.lobbyBusy = false;
		renderApp();
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
	setFeedback("lobby", "Lobby verlassen.");
}

export function openHighscores() {
	state.route = "highscores";
	window.location.hash = gameHash("highscores");
	renderApp();
}
