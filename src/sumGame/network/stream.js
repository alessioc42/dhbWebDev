import { client } from "./client.js";
import { gameHash } from "../app/routes.js";
import { setRoute } from "../app/router.js";
import { clearSession, closeStream, clearRoundHistory, recordRoundResult, state, syncRoundHistoryFromGame } from "../app/state.js";
import { upsertHighscore } from "../app/storage.js";
import { renderApp, setFeedback } from "../ui/render/index.js";

export async function connectSession() {
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
	state.feedback.highscores = "";
	state.feedback.lobby = "";
	setRoute("highscores");
}

function handleSessionLost(message) {
	closeStream();
	clearSession();
	state.feedback.game = "";
	state.feedback.highscores = "";
	setFeedback("lobby", message);
	state.route = "lobby";
	window.location.hash = gameHash("lobby");
	renderApp();
}

function handleStreamEvent(event) {
	switch (event.event) {
		case "error":
			handleSessionLost(event.data?.message || "Stream error.");
			break;
		case "lobby_state":
			state.lobby = event.data;
			state.game = event.data.game || state.game;
			syncRoundHistoryFromGame(state.game);
			if (state.session && state.route !== "highscores") {
				state.route = "game";
			}
			renderApp();
			break;
		case "game_started":
			state.game = event.data;
			clearRoundHistory();
			setFeedback("game", "Game started.");
			if (state.route !== "highscores") {
				state.route = "game";
			}
			renderApp();
			break;
		case "game_state":
			state.game = event.data;
			syncRoundHistoryFromGame(event.data);
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
			recordRoundResult(event.data);
			setFeedback("game", `Round ${event.data.roundNumber} complete.`);
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
