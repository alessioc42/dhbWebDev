import { applyStatusClass } from "../../../ui/feedback.js";
import { syncGamePhaseClass, syncSumGameRouteClass } from "../../../ui/shell.js";
import { normalizeRoute } from "../../app/routes.js";
import { state } from "../../app/state.js";
import { refs } from "../refs.js";
import { renderGameView } from "./game.js";
import { renderHighscoreView } from "./highscores.js";
import { renderLobbyView } from "./lobby.js";

export function renderApp() {
	state.route = normalizeRoute(window.location.hash || `#/${state.route}`);
	syncSumGameRouteClass(state.route);
	syncGamePhaseClass(resolveGamePhase());

	renderLobbyView();
	renderGameView(setFeedback, renderApp);
	renderHighscoreView();
}

export { renderLobbyView } from "./lobby.js";

function resolveGamePhase() {
	if (state.route !== "game") {
		return "";
	}

	if (state.game?.phase) {
		return state.game.phase;
	}

	return state.session ? "waiting" : "";
}

export function setFeedback(area, message) {
	state.feedback[area] = message;
	renderApp();
}

export { applyStatusClass };
