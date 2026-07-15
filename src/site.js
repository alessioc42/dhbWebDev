export function parseSiteHash(hash) {
	const segments = String(hash || "#/").replace(/^#\/?/u, "").split("/").filter(Boolean);
	const first = (segments[0] || "").toLowerCase();

	if (first === "sumgame") {
		return { game: "sumGame" };
	}

	return { game: "home" };
}

export function showGameScreen(game) {
	document.documentElement.dataset.activeGame = game;
}

export function syncShellFromHash(hash = window.location.hash) {
	showGameScreen(parseSiteHash(hash).game);
}
