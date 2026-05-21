import { GameClient } from "./game-client.js";

const SERVER_HOST =
	globalThis.GAME_SERVER_HOST ||
	new URLSearchParams(window.location.search).get("server") ||
	"http://127.0.0.1:3000";

const STORAGE_KEYS = {
	session: "math-game-session-v1",
	highscores: "math-game-highscores-v1",
};

const HIGH_SCORE_LIMIT = 50;

const client = new GameClient(SERVER_HOST);

const refs = {
	lobbyScreen: document.getElementById("lobbyScreen"),
	gameScreen: document.getElementById("gameScreen"),
	highscoreScreen: document.getElementById("highscoreScreen"),
	createLobbyForm: document.getElementById("createLobbyForm"),
	createUsernameInput: document.getElementById("createUsernameInput"),
	joinLobbyForm: document.getElementById("joinLobbyForm"),
	joinUsernameInput: document.getElementById("joinUsernameInput"),
	joinCodeInput: document.getElementById("joinCodeInput"),
	lobbyStatus: document.getElementById("lobbyStatus"),
	openHighscoresFromLobby: document.getElementById("openHighscoresFromLobby"),
	gameLobbyCode: document.getElementById("gameLobbyCode"),
	gameRoundInfo: document.getElementById("gameRoundInfo"),
	gameStatus: document.getElementById("gameStatus"),
	roundResult: document.getElementById("roundResult"),
	scoreboardList: document.getElementById("scoreboardList"),
	optionList: document.getElementById("optionList"),
	leaveLobbyButton: document.getElementById("leaveLobbyButton"),
	openHighscoresFromGame: document.getElementById("openHighscoresFromGame"),
	highscoreStatus: document.getElementById("highscoreStatus"),
	highscoreList: document.getElementById("highscoreList"),
	backToLobbyButton: document.getElementById("backToLobbyButton"),
};

const state = {
	route: "lobby",
	session: loadSession(),
	lobby: null,
	game: null,
	stream: null,
	lastRoundResult: null,
	finalizedGameIds: new Set(),
	feedback: {
		lobby: "Ready.",
		game: "Idle.",
		highscores: "Stored games.",
	},
};

function normalizeRoute(hash) {
	const route = String(hash || "").replace(/^#\/?/u, "").toLowerCase();
	if (route === "game" || route === "highscores") {
		return route;
	}

	return "lobby";
}

function setRoute(route) {
	const nextRoute = normalizeRoute(`#/${route}`);
	if (normalizeRoute(window.location.hash) !== nextRoute) {
		window.location.hash = `#/${nextRoute}`;
		return;
	}

	state.route = nextRoute;
	renderApp();
}

function loadSession() {
	try {
		const rawSession = window.localStorage.getItem(STORAGE_KEYS.session);
		if (!rawSession) {
			return null;
		}

		const parsed = JSON.parse(rawSession);
		if (!parsed || typeof parsed !== "object") {
			return null;
		}

		const lobbyCode = typeof parsed.lobbyCode === "string" ? parsed.lobbyCode.trim().toUpperCase() : "";
		const userSecret = typeof parsed.userSecret === "string" ? parsed.userSecret.trim() : "";
		const username = typeof parsed.username === "string" ? parsed.username.trim() : "";

		if (!lobbyCode || !userSecret || !username) {
			return null;
		}

		return { lobbyCode, userSecret, username };
	} catch {
		return null;
	}
}

function saveSession(session) {
	if (!session) {
		window.localStorage.removeItem(STORAGE_KEYS.session);
		return;
	}

	window.localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
}

function loadHighscores() {
	try {
		const rawHighscores = window.localStorage.getItem(STORAGE_KEYS.highscores);
		if (!rawHighscores) {
			return [];
		}

		const parsed = JSON.parse(rawHighscores);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function saveHighscores(highscores) {
	window.localStorage.setItem(STORAGE_KEYS.highscores, JSON.stringify(highscores));
}

function upsertHighscore(record) {
	const highscores = loadHighscores().filter((entry) => entry.gameId !== record.gameId);
	highscores.push(record);
	highscores.sort(
		(left, right) =>
			right.highScore - left.highScore ||
			new Date(right.playedAt).getTime() - new Date(left.playedAt).getTime(),
	);
	saveHighscores(highscores.slice(0, HIGH_SCORE_LIMIT));
}

function clearSession() {
	state.session = null;
	state.lobby = null;
	state.game = null;
	state.lastRoundResult = null;
	saveSession(null);
}

function closeStream() {
	if (state.stream) {
		state.stream.close();
		state.stream = null;
	}
}

function formatScore(value) {
	return Number(value || 0).toFixed(2);
}

function currentPlayer(gameState = state.game) {
	if (!gameState || !state.session) {
		return null;
	}

	return gameState.players.find((player) => player.userSecret === state.session.userSecret) || null;
}

function formatRoundResult(result) {
	if (!result) {
		return "";
	}

	return `Round ${result.roundNumber} won by ${result.winner.username} with ${formatScore(result.roundScore)} points in ${formatScore(result.durationSeconds)} seconds.`;
}

function setFeedback(area, message) {
	state.feedback[area] = message;
	renderApp();
}

function renderLobbyView() {
	const lobbyCode = state.session?.lobbyCode;
	refs.lobbyStatus.textContent = lobbyCode
		? `${state.feedback.lobby} Lobby code: ${lobbyCode}.`
		: state.feedback.lobby;
}

function renderGameView() {
	refs.gameStatus.textContent = state.feedback.game;
	refs.roundResult.textContent = formatRoundResult(state.lastRoundResult);

	const gameState = state.game;
	const localPlayer = currentPlayer(gameState);
	const players = Array.isArray(gameState?.players) ? [...gameState.players] : [];
	if (state.session?.userSecret) {
		players.sort((left, right) => {
			const leftIsLocal = left.userSecret === state.session.userSecret;
			const rightIsLocal = right.userSecret === state.session.userSecret;
			if (leftIsLocal !== rightIsLocal) {
				return leftIsLocal ? -1 : 1;
			}

			return right.totalScore - left.totalScore || left.username.localeCompare(right.username);
		});
	}

	refs.gameLobbyCode.textContent = state.session ? `Lobby code: ${state.session.lobbyCode}` : "No lobby connected.";
	refs.gameRoundInfo.textContent =
		gameState && gameState.phase === "playing" && gameState.target !== null
			? `Round ${gameState.roundNumber} of ${gameState.totalRounds}. Target: ${gameState.target}. Your value: ${formatScore(localPlayer?.roundValue)}.`
			: "Waiting for the second player.";

	refs.scoreboardList.innerHTML = "";
	for (const player of players) {
		const item = document.createElement("li");
		item.textContent = `${player.username}: round ${formatScore(player.roundValue)} | total ${formatScore(player.totalScore)}`;
		refs.scoreboardList.append(item);
	}

	refs.optionList.innerHTML = "";
	const canChoose = Boolean(
		gameState &&
		gameState.phase === "playing" &&
		localPlayer &&
		Array.isArray(gameState.options) &&
		gameState.options.length > 0,
	);

	if (!canChoose) {
		const message = document.createElement("p");
		message.textContent = "No options are available yet.";
		refs.optionList.append(message);
		return;
	}

	for (const option of gameState.options) {
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = String(option.value);
		button.disabled = localPlayer.selectedOptionIds.includes(option.id);
		button.addEventListener("click", async () => {
			button.disabled = true;
			try {
				await client.chooseOption(state.session.userSecret, option.id);
			} catch (error) {
				button.disabled = false;
				setFeedback("game", error.message);
			}
		});
		refs.optionList.append(button, document.createTextNode(" "));
	}
}

function renderHighscoreView() {
	refs.highscoreStatus.textContent = state.feedback.highscores;
	const highscores = loadHighscores();
	refs.highscoreList.innerHTML = "";

	if (highscores.length === 0) {
		const emptyItem = document.createElement("li");
		emptyItem.textContent = "No finished games yet.";
		refs.highscoreList.append(emptyItem);
		return;
	}

	for (const entry of highscores) {
		const item = document.createElement("li");
		item.textContent = `${new Date(entry.playedAt).toLocaleString()} | ${entry.ownName} vs ${entry.opponentName} | ${formatScore(entry.ownScore)} - ${formatScore(entry.opponentScore)} | high ${formatScore(entry.highScore)}`;
		refs.highscoreList.append(item);
	}
}

function renderApp() {
	state.route = normalizeRoute(window.location.hash || `#/${state.route}`);
	refs.lobbyScreen.hidden = state.route !== "lobby";
	refs.gameScreen.hidden = state.route !== "game";
	refs.highscoreScreen.hidden = state.route !== "highscores";
	renderLobbyView();
	renderGameView();
	renderHighscoreView();
}

async function connectSession() {
	if (!state.session) {
		return;
	}

	closeStream();
	state.stream = await client.connectLobby({
		lobbyCode: state.session.lobbyCode,
		userSecret: state.session.userSecret,
		onEvent(event) {
			handleStreamEvent(event);
		},
	});
}

function finalizeGame(finalResult) {
	if (!finalResult || state.finalizedGameIds.has(finalResult.gameId)) {
		return;
	}

	state.finalizedGameIds.add(finalResult.gameId);

	const session = state.session;
	if (session) {
		const scores = Array.isArray(finalResult.scores) ? finalResult.scores : [];
		const ownEntry =
			scores.find((entry) => entry.userSecret === session.userSecret) ||
			scores.find((entry) => entry.username === session.username) ||
			null;
		const opponentEntry = scores.find((entry) => entry.userSecret !== ownEntry?.userSecret) || null;

		if (ownEntry) {
			upsertHighscore({
				gameId: finalResult.gameId,
				playedAt: finalResult.finishedAt || new Date().toISOString(),
				lobbyCode: finalResult.lobbyCode || session.lobbyCode,
				ownName: session.username,
				opponentName: opponentEntry?.username || "Unknown",
				ownScore: ownEntry.score,
				opponentScore: opponentEntry?.score ?? 0,
				highScore: Math.max(ownEntry.score, opponentEntry?.score ?? 0),
				won: Boolean(finalResult.winner && finalResult.winner.userSecret === ownEntry.userSecret),
			});
		}
	}

	closeStream();
	clearSession();
	state.feedback.game = "Game finished.";
	state.feedback.highscores = "Stored games.";
	state.feedback.lobby = "Ready.";
	setRoute("highscores");
}

function handleStreamEvent(event) {
	switch (event.event) {
		case "error":
			setFeedback(state.route === "game" ? "game" : "lobby", event.data?.message || "Stream error.");
			break;
		case "lobby_state":
			state.lobby = event.data;
			state.game = event.data.game || state.game;
			if (state.session && state.route !== "highscores") {
				state.route = "game";
			}
			renderApp();
			break;
		case "game_started":
			state.game = event.data;
			state.lastRoundResult = null;
			setFeedback("game", "Game started.");
			if (state.route !== "highscores") {
				state.route = "game";
			}
			renderApp();
			break;
		case "game_state":
			state.game = event.data;
			if (event.data.phase === "finished") {
				finalizeGame(event.data.finalResult || state.game?.finalResult || null);
				return;
			}

			if (state.session && state.route !== "highscores") {
				state.route = "game";
			}
			renderApp();
			break;
		case "round_result":
			state.lastRoundResult = event.data;
			setFeedback("game", formatRoundResult(event.data));
			break;
		case "player_joined":
			setFeedback("game", `${event.data.username} joined the lobby.`);
			break;
		case "player_left":
			setFeedback("game", `${event.data.username} left the lobby.`);
			break;
		case "lobby_closed":
			closeStream();
			clearSession();
			setFeedback("lobby", "Lobby closed.");
			state.route = "lobby";
			renderApp();
			break;
		case "game_over":
			finalizeGame(event.data);
			break;
		default:
			break;
	}
}

async function handleCreateLobby(event) {
	event.preventDefault();
	const username = refs.createUsernameInput.value.trim();
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
		window.location.hash = "#/game";
		state.route = "game";
		setFeedback("game", `Lobby ${result.lobbyCode} created. Waiting for the second player.`);
		renderApp();
		await connectSession();
	} catch (error) {
		setFeedback("lobby", error.message);
	}
}

async function handleJoinLobby(event) {
	event.preventDefault();
	const username = refs.joinUsernameInput.value.trim();
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
		window.location.hash = "#/game";
		state.route = "game";
		setFeedback("game", `Joined lobby ${result.lobbyCode}.`);
		renderApp();
		await connectSession();
	} catch (error) {
		setFeedback("lobby", error.message);
	}
}

function leaveLobby() {
	closeStream();
	clearSession();
	state.finalizedGameIds.clear();
	state.lastRoundResult = null;
	state.route = "lobby";
	setFeedback("lobby", "Left the lobby.");
	window.location.hash = "#/lobby";
	renderApp();
}

function openHighscores() {
	state.route = "highscores";
	setFeedback("highscores", "Stored games.");
	window.location.hash = "#/highscores";
	renderApp();
}

function handleHashChange() {
	const nextRoute = normalizeRoute(window.location.hash);
	state.route = nextRoute;
	if (nextRoute === "highscores") {
		renderApp();
		return;
	}

	if (!state.session) {
		state.route = nextRoute === "game" ? "lobby" : nextRoute;
		renderApp();
		return;
	}

	state.route = "game";
	renderApp();
}

refs.createLobbyForm.addEventListener("submit", handleCreateLobby);
refs.joinLobbyForm.addEventListener("submit", handleJoinLobby);
refs.leaveLobbyButton.addEventListener("click", leaveLobby);
refs.openHighscoresFromLobby.addEventListener("click", openHighscores);
refs.openHighscoresFromGame.addEventListener("click", openHighscores);
refs.backToLobbyButton.addEventListener("click", leaveLobby);
window.addEventListener("hashchange", handleHashChange);

if (!window.location.hash) {
	window.location.hash = state.session ? "#/game" : "#/lobby";
}

handleHashChange();

if (state.session && state.route !== "highscores") {
	state.route = "game";
	renderApp();
	connectSession().catch((error) => {
		setFeedback("lobby", error.message);
		closeStream();
		clearSession();
		state.route = "lobby";
		window.location.hash = "#/lobby";
		renderApp();
	});
} else {
	renderApp();
}
