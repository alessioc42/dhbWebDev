export const GAME_ID = "sumGame";

export function gameHash(route = "lobby") {
	return `#/${GAME_ID}/${route}`;
}

export function normalizeRoute(hash) {
	const raw = String(hash || "").replace(/^#\/?/u, "");
	const segments = raw.split("/").filter(Boolean);

	if (segments[0] === GAME_ID) {
		segments.shift();
	}

	const route = (segments[0] || "lobby").toLowerCase();
	if (route === "game" || route === "highscores") {
		return route;
	}

	return "lobby";
}
