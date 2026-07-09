import { renderApp } from "../ui/render/index.js";
import { gameHash, normalizeRoute } from "./routes.js";
import { state } from "./state.js";

export { gameHash, normalizeRoute } from "./routes.js";

export function setRoute(route) {
	const nextRoute = normalizeRoute(gameHash(route));
	if (normalizeRoute(window.location.hash) !== nextRoute) {
		window.location.hash = gameHash(nextRoute);
		return;
	}

	state.route = nextRoute;
	renderApp();
}

export function handleHashChange() {
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
