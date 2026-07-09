import { applyStatusClass } from "../../../ui/feedback.js";
import { state } from "../../app/state.js";
import { refs } from "../refs.js";

export function renderLobbyView() {
	const lobbyCode = state.session?.lobbyCode;
	const message = state.feedback.lobby || (lobbyCode ? `Lobby code: ${lobbyCode}.` : "");
	applyStatusClass(refs.lobbyStatus, message);
}
