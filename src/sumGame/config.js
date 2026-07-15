export const SERVER_HOST =
	globalThis.GAME_SERVER_HOST ||
	new URLSearchParams(window.location.search).get("server") ||
	(typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:3000");

export const STORAGE_KEYS = {
	session: "sumGame-session-v1",
	highscores: "sumGame-highscores-v1",
};

export const HIGH_SCORE_LIMIT = 50;
