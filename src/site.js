export function parseSiteHash(hash) {
	const segments = String(hash || "#/").replace(/^#\/?/u, "").split("/").filter(Boolean);
	const first = (segments[0] || "").toLowerCase();

	if (first === "onlinegame") {
		return { game: "onlineGame", segments: segments.slice(1) };
	}

	if (first === "offlinegame") {
		return { game: "offlineGame", segments: segments.slice(1) };
	}

	if (first === "lobby" || first === "game" || first === "highscores") {
		return { game: "onlineGame", segments, legacy: true };
	}

	return { game: "home", segments: [] };
}

export function showGameScreen(game) {
	document.documentElement.dataset.activeGame = game;
}

export function activeGameFromHash(hash) {
	return parseSiteHash(hash).game;
}

export function syncShellFromHash(hash = window.location.hash) {
	showGameScreen(activeGameFromHash(hash));
}
