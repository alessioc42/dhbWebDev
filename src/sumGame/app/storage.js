import { HIGH_SCORE_LIMIT, STORAGE_KEYS } from "../config.js";

export function loadSession() {
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

export function saveSession(session) {
	if (!session) {
		window.localStorage.removeItem(STORAGE_KEYS.session);
		return;
	}

	window.localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
}

export function loadHighscores() {
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

export function upsertHighscore(record) {
	const highscores = loadHighscores().filter((entry) => entry.gameId !== record.gameId);
	highscores.push(record);
	highscores.sort(
		(left, right) =>
			right.highScore - left.highScore ||
			new Date(right.playedAt).getTime() - new Date(left.playedAt).getTime(),
	);
	saveHighscores(highscores.slice(0, HIGH_SCORE_LIMIT));
}
