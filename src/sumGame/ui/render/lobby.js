import { applyStatusClass } from "../../../ui/feedback.js";
import { state } from "../../app/state.js";
import { refs } from "../refs.js";

const LOBBY_CODE_PATTERN = /^[A-Z]{4}$/u;

function lobbyUsername() {
	return refs.usernameInput?.value.trim() ?? "";
}

function lobbyCode() {
	return refs.joinCodeInput?.value.trim().toUpperCase() ?? "";
}

export function canCreateLobby() {
	if (state.lobbyBusy || state.session) {
		return false;
	}

	return lobbyUsername().length > 0;
}

export function canJoinLobby() {
	if (state.lobbyBusy || state.session) {
		return false;
	}

	return lobbyUsername().length > 0 && LOBBY_CODE_PATTERN.test(lobbyCode());
}

function syncLobbyControls() {
	const busy = state.lobbyBusy;
	const inSession = Boolean(state.session);
	const createEnabled = canCreateLobby();
	const joinEnabled = canJoinLobby();

	if (refs.createLobbySubmit) {
		refs.createLobbySubmit.disabled = !createEnabled;
	}

	if (refs.joinLobbySubmit) {
		refs.joinLobbySubmit.disabled = !joinEnabled;
	}

	if (refs.usernameInput) {
		refs.usernameInput.disabled = busy || inSession;
	}

	if (refs.joinCodeInput) {
		refs.joinCodeInput.disabled = busy || inSession;
	}

	if (refs.roundsInput) {
		refs.roundsInput.disabled = busy || inSession;
	}

	if (refs.difficultyInput) {
		refs.difficultyInput.disabled = busy || inSession;
	}
}

export function renderLobbyView() {
	const lobbyCode = state.session?.lobbyCode;
	const message = state.feedback.lobby || (lobbyCode ? `Lobby-Code: ${lobbyCode}.` : "");
	applyStatusClass(refs.lobbyStatus, message);
	syncLobbyControls();
}
