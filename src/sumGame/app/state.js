import { loadSession, saveSession } from "./storage.js";

export const state = {
	route: "lobby",
	session: loadSession(),
	lobby: null,
	game: null,
	stream: null,
	lastRoundResult: null,
	roundHistory: [],
	finalizedGameIds: new Set(),
	feedback: {
		lobby: "",
		game: "",
		highscores: "",
	},
};

export function recordRoundResult(result) {
	if (!result || typeof result.roundNumber !== "number") {
		return;
	}

	state.lastRoundResult = result;

	if (state.roundHistory.some((entry) => entry.roundNumber === result.roundNumber)) {
		return;
	}

	state.roundHistory.push(result);
	state.roundHistory.sort((left, right) => left.roundNumber - right.roundNumber);
}

export function clearRoundHistory() {
	state.lastRoundResult = null;
	state.roundHistory = [];
}

export function syncRoundHistoryFromGame(gameState) {
	if (!gameState?.lastResult) {
		return;
	}

	recordRoundResult(gameState.lastResult);
}

export function clearSession() {
	state.session = null;
	state.lobby = null;
	state.game = null;
	clearRoundHistory();
	saveSession(null);
}

export function closeStream() {
	if (state.stream) {
		state.stream.close();
		state.stream = null;
	}
}
