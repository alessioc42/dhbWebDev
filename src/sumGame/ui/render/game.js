import { applyStatusClass, feedbackTone } from "../../../ui/feedback.js";
import { formatLobbySettings } from "../../game-settings.js";
import { state, syncRoundHistoryFromGame } from "../../app/state.js";
import { client } from "../../network/client.js";
import {
	buildEquationPlan,
	hideEquationChain,
	showEquationChain,
	syncEquationExpression,
} from "../equation-chain.js";
import { currentPlayer, formatScore } from "../format.js";
import { refs } from "../refs.js";

function buildRoundOutcomes(localPlayerSecret) {
	const outcomes = new Map();

	for (const result of state.roundHistory) {
		outcomes.set(result.roundNumber, result.winner.userSecret === localPlayerSecret);
	}

	const lastResult = state.game?.lastResult;
	if (lastResult && !outcomes.has(lastResult.roundNumber)) {
		outcomes.set(lastResult.roundNumber, lastResult.winner.userSecret === localPlayerSecret);
	}

	return outcomes;
}

function renderRoundTimeline(gameState, localPlayerSecret) {
	if (!gameState || gameState.phase !== "playing") {
		refs.roundTimeline.hidden = true;
		refs.roundTimeline.replaceChildren();
		return;
	}

	const totalRounds = gameState.totalRounds || 0;
	if (totalRounds <= 0) {
		refs.roundTimeline.hidden = true;
		refs.roundTimeline.replaceChildren();
		return;
	}

	const outcomes = buildRoundOutcomes(localPlayerSecret);
	const currentRound = gameState.roundNumber;
	const fragment = document.createDocumentFragment();

	refs.roundTimeline.setAttribute("role", "list");
	refs.roundTimeline.setAttribute("aria-label", "Rundenverlauf");

	for (let roundNumber = 1; roundNumber <= totalRounds; roundNumber += 1) {
		const slot = document.createElement("div");
		slot.className = "round-timeline__slot";
		slot.setAttribute("role", "listitem");

		if (outcomes.has(roundNumber)) {
			const won = outcomes.get(roundNumber);
			slot.classList.add(won ? "round-timeline__slot--won" : "round-timeline__slot--lost");
			slot.textContent = won ? "G" : "V";
			slot.title = `Runde ${roundNumber}: ${won ? "Gewonnen" : "Verloren"}`;
			slot.setAttribute("aria-label", `Runde ${roundNumber}, ${won ? "gewonnen" : "verloren"}`);
		} else if (roundNumber === currentRound) {
			slot.classList.add("round-timeline__slot--current");
			slot.textContent = String(roundNumber);
			slot.title = `Runde ${roundNumber}: läuft`;
			slot.setAttribute("aria-label", `Runde ${roundNumber}, läuft`);
		} else {
			slot.classList.add("round-timeline__slot--pending");
			slot.textContent = String(roundNumber);
			slot.title = `Runde ${roundNumber}: ausstehend`;
			slot.setAttribute("aria-label", `Runde ${roundNumber}, ausstehend`);
		}

		fragment.append(slot);
	}

	refs.roundTimeline.replaceChildren(fragment);
	refs.roundTimeline.hidden = false;
}

function renderPlayInfoWaiting(message) {
	const element = refs.gameTargetNumber;
	element.hidden = false;
	element.className = `play-info play-info--waiting status status--${feedbackTone(message)}`;
	element.textContent = message;
}

function renderEquationChain(gameState, localPlayer) {
	const container = refs.equationChain ?? document.getElementById("equationChain");
	const expression = refs.equationExpr ?? container?.querySelector(".equation-chain__expr");
	if (!container || !expression) {
		return;
	}

	const isPlaying = gameState?.phase === "playing" && gameState.target !== null && localPlayer;
	if (!isPlaying) {
		hideEquationChain(container, expression);
		return;
	}

	const optionById = new Map(gameState.options.map((option) => [option.id, option]));
	const selectedOptions = (localPlayer.selectedOptionIds || [])
		.map((optionId) => optionById.get(optionId))
		.filter(Boolean);
	const sumValue = selectedOptions.length > 0 ? localPlayer.roundValue : 0;
	const plan = buildEquationPlan(selectedOptions, sumValue, gameState.target);

	showEquationChain(container);
	syncEquationExpression(expression, plan);
}

function renderPlayInfo(gameState, localPlayer) {
	const isPlaying = gameState?.phase === "playing" && gameState.target !== null;
	if (isPlaying) {
		refs.gameTargetNumber.hidden = true;
		refs.gameTargetNumber.replaceChildren();
		return;
	}

	renderPlayInfoWaiting("Warte auf den zweiten Spieler.");
}

function renderScoreboard(localPlayerSecret, players) {
	refs.scoreboardList.innerHTML = "";
	refs.scoreboardList.setAttribute("role", "list");
	refs.scoreboardList.setAttribute("aria-label", "Punktestand");

	for (const player of players) {
		const item = document.createElement("li");
		const isLocal = player.userSecret === localPlayerSecret;
		const roundScore = formatScore(player.roundValue);
		const totalScore = formatScore(player.totalScore);
		const summary = `Runde ${roundScore}, gesamt ${totalScore}`;

		item.className = isLocal ? "scoreboard-row scoreboard-row--local" : "scoreboard-row";
		item.textContent = `${player.username}: Runde ${roundScore} | gesamt ${totalScore}`;
		item.setAttribute("aria-label", isLocal ? `Du, ${player.username}, ${summary}` : `${player.username}, ${summary}`);
		refs.scoreboardList.append(item);
	}
}

function renderOptions(gameState, localPlayer, setFeedback, renderApp) {
	refs.optionList.innerHTML = "";
	refs.optionList.className = "option-grid option-grid--rect";

	const canChoose = Boolean(
		gameState &&
			gameState.phase === "playing" &&
			localPlayer &&
			Array.isArray(gameState.options) &&
			gameState.options.length > 0,
	);

	if (!canChoose) {
		const message = document.createElement("p");
		message.className = "option-empty";
		message.textContent = "Noch keine Zahlen verfügbar.";
		refs.optionList.append(message);
		return;
	}

	for (const option of gameState.options) {
		const isSelected = Boolean(localPlayer.selectedOptionIds.includes(option.id));
		const button = document.createElement("button");
		button.type = "button";
		button.className = isSelected ? "option-cell option-cell--selected" : "option-cell";
		button.textContent = String(option.value);
		button.setAttribute(
			"aria-label",
			isSelected ? `Zahl ${option.value}, ausgewählt` : `Zahl ${option.value} auswählen`,
		);
		button.setAttribute("aria-pressed", String(isSelected));
		button.addEventListener("click", async () => {
			try {
				const result = await client.chooseOption(state.session.userSecret, option.id);
				if (result?.game) {
					state.game = result.game;
					state.lobby = { ...(state.lobby || {}), game: result.game };
					syncRoundHistoryFromGame(result.game);
				}
				renderApp();
			} catch (error) {
				setFeedback("game", error.message);
			}
		});
		refs.optionList.append(button);
	}
}

export function renderGameView(setFeedback, renderApp) {
	applyStatusClass(refs.gameStatus, state.feedback.game);

	const gameState = state.game;
	const localPlayer = currentPlayer(gameState);
	const players = Array.isArray(gameState?.players) ? [...gameState.players] : [];
	if (state.session?.userSecret) {
		players.sort((left, right) => {
			const leftIsLocal = left.userSecret === state.session.userSecret;
			const rightIsLocal = right.userSecret === state.session.userSecret;
			if (leftIsLocal !== rightIsLocal) {
				return leftIsLocal ? -1 : 1;
			}

			return right.totalScore - left.totalScore || left.username.localeCompare(right.username);
		});
	}

	const settingsLabel = formatLobbySettings(state.lobby?.settings);
	const lobbyPrefix = settingsLabel ? `${settingsLabel} · ` : "";
	refs.gameLobbyCode.textContent = state.session
		? `${lobbyPrefix}Lobby-Code: ${state.session.lobbyCode}`
		: "Keine Lobby verbunden.";

	renderRoundTimeline(gameState, state.session?.userSecret);
	renderPlayInfo(gameState, localPlayer);
	renderOptions(gameState, localPlayer, setFeedback, renderApp);
	renderEquationChain(gameState, localPlayer);
	renderScoreboard(state.session?.userSecret, players);
}
