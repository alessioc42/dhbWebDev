import { parseSiteHash } from "../site.js";
import { handleCreateLobby, handleJoinLobby, leaveLobby, openHighscores } from "./app/actions.js";
import { gameHash } from "./app/routes.js";
import { handleHashChange } from "./app/router.js";
import { clearSession, closeStream, state } from "./app/state.js";
import { connectSession } from "./network/stream.js";
import { refs } from "./ui/refs.js";
import { renderApp, renderLobbyView, setFeedback } from "./ui/render/index.js";

let initialized = false;

function syncRoundsLabel() {
	if (!refs.roundsInput || !refs.roundsValue) {
		return;
	}

	const min = Number(refs.roundsInput.min);
	const max = Number(refs.roundsInput.max);
	const value = Number(refs.roundsInput.value);
	const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;

	refs.roundsInput.style.setProperty("--range-fill", `${percent}%`);
	refs.roundsValue.textContent = String(value);
}

function onHashChange() {
	if (parseSiteHash(window.location.hash).game !== "sumGame") {
		return;
	}

	handleHashChange();
}

export function teardownSumGame() {
	closeStream();
}

export function startSumGame() {
	if (initialized) {
		handleHashChange();
		return;
	}

	initialized = true;

	refs.roundsInput?.addEventListener("input", syncRoundsLabel);
	syncRoundsLabel();
	refs.usernameInput?.addEventListener("input", () => renderLobbyView());
	refs.joinCodeInput?.addEventListener("input", () => renderLobbyView());
	refs.createLobbyForm.addEventListener("submit", handleCreateLobby);
	refs.joinLobbyForm.addEventListener("submit", handleJoinLobby);
	refs.leaveLobbyButton.addEventListener("click", leaveLobby);
	refs.openHighscoresFromLobby.addEventListener("click", openHighscores);
	refs.openHighscoresFromGame.addEventListener("click", openHighscores);
	refs.backToLobbyButton.addEventListener("click", leaveLobby);
	window.addEventListener("hashchange", onHashChange);

	if (!normalizeInitialHash()) {
		handleHashChange();
	}

	if (state.session && state.route !== "highscores") {
		state.route = "game";
		renderApp();
		connectSession().catch((error) => {
			setFeedback("lobby", error.message);
			closeStream();
			clearSession();
			state.route = "lobby";
			window.location.hash = gameHash("lobby");
			renderApp();
		});
	} else {
		renderApp();
	}
}

function normalizeInitialHash() {
	const hash = window.location.hash;
	if (!hash || hash === "#/" || hash === "#") {
		window.location.hash = state.session ? gameHash("game") : gameHash("lobby");
		return true;
	}

	return false;
}
