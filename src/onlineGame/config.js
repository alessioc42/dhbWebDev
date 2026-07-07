export const SERVER_HOST =
	globalThis.GAME_SERVER_HOST ||
	new URLSearchParams(window.location.search).get("server") ||
	"http://127.0.0.1:3000";

export const STORAGE_KEYS = {
	session: "onlineGame-session-v1",
	highscores: "onlineGame-highscores-v1",
};

export const HIGH_SCORE_LIMIT = 50;
