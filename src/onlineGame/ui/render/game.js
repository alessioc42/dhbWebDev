import { applyStatusClass, feedbackTone } from "../../../ui/feedback.js";
import { state, syncRoundHistoryFromGame } from "../../app/state.js";
import { client } from "../../network/client.js";
import { currentPlayer, formatRoundValue, formatScore, formatSignedDifference } from "../format.js";
import { playInfoIcons } from "../icons.js";
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

	for (let roundNumber = 1; roundNumber <= totalRounds; roundNumber += 1) {
		const slot = document.createElement("div");
		slot.className = "round-timeline__slot";

		if (outcomes.has(roundNumber)) {
			const won = outcomes.get(roundNumber);
			slot.classList.add(won ? "round-timeline__slot--won" : "round-timeline__slot--lost");
			slot.textContent = won ? "W" : "L";
			slot.title = `Round ${roundNumber}: ${won ? "Won" : "Lost"}`;
			slot.setAttribute("aria-label", `Round ${roundNumber}, ${won ? "won" : "lost"}`);
		} else if (roundNumber === currentRound) {
			slot.classList.add("round-timeline__slot--current");
			slot.textContent = String(roundNumber);
			slot.title = `Round ${roundNumber}: in progress`;
			slot.setAttribute("aria-label", `Round ${roundNumber}, in progress`);
		} else {
			slot.classList.add("round-timeline__slot--pending");
			slot.textContent = String(roundNumber);
			slot.title = `Round ${roundNumber}: pending`;
			slot.setAttribute("aria-label", `Round ${roundNumber}, pending`);
		}

		fragment.append(slot);
	}

	refs.roundTimeline.replaceChildren(fragment);
	refs.roundTimeline.hidden = false;
}

function createPlayStat({ iconUrl, label, value, modifier, signed = false }) {
	const stat = document.createElement("div");
	stat.className = `play-stat play-stat--${modifier}`;
	stat.setAttribute("role", "group");

	const icon = document.createElement("span");
	icon.className = "play-stat__icon";
	icon.style.setProperty("--icon", `url("${iconUrl}")`);
	icon.setAttribute("aria-hidden", "true");

	const valueEl = document.createElement("span");
	valueEl.className = signed ? "play-stat__value play-stat__value--signed" : "play-stat__value";

	if (signed) {
		const signEl = document.createElement("span");
		signEl.className = "play-stat__sign";
		signEl.textContent = value.sign;

		const amountEl = document.createElement("span");
		amountEl.className = "play-stat__amount";
		amountEl.textContent = value.amount;

		valueEl.append(signEl, amountEl);
		stat.setAttribute("aria-label", `${label} ${value.sign}${value.amount}`);
	} else {
		valueEl.textContent = value;
		stat.setAttribute("aria-label", `${label} ${value}`);
	}

	stat.append(icon, valueEl);
	return stat;
}

function renderPlayInfoWaiting(message) {
	const element = refs.gameTargetNumber;
	element.hidden = false;
	element.className = `play-info play-info--waiting status status--${feedbackTone(message)}`;
	element.textContent = message;
}

function renderPlayInfo(gameState, localPlayer) {
	const isPlaying = gameState?.phase === "playing" && gameState.target !== null;
	if (!isPlaying) {
		renderPlayInfoWaiting("Waiting for the second player.");
		return;
	}

	const target = gameState.target;
	const value = formatRoundValue(localPlayer?.roundValue);
	const difference = formatSignedDifference(target, localPlayer?.roundValue);

	const element = refs.gameTargetNumber;
	element.hidden = false;
	element.className = "play-info play-info--playing";
	element.replaceChildren(
		createPlayStat({
			iconUrl: playInfoIcons.target,
			label: "Target",
			value: String(target),
			modifier: "target",
		}),
		createPlayStat({
			iconUrl: playInfoIcons.sum,
			label: "Your value",
			value,
			modifier: "value",
		}),
		createPlayStat({
			iconUrl: playInfoIcons.difference,
			label: "Difference",
			value: difference,
			modifier: "difference",
			signed: true,
		}),
	);
}

function renderScoreboard(localPlayerSecret, players) {
	refs.scoreboardList.innerHTML = "";
	for (const player of players) {
		const item = document.createElement("li");
		const isLocal = player.userSecret === localPlayerSecret;
		item.className = isLocal ? "scoreboard-row scoreboard-row--local" : "scoreboard-row";
		item.textContent = `${player.username}: round ${formatScore(player.roundValue)} | total ${formatScore(player.totalScore)}`;
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
		message.textContent = "No options are available yet.";
		refs.optionList.append(message);
		return;
	}

	for (const option of gameState.options) {
		const isSelected = Boolean(localPlayer.selectedOptionIds.includes(option.id));
		const button = document.createElement("button");
		button.type = "button";
		button.className = isSelected ? "option-cell option-cell--selected" : "option-cell";
		button.textContent = String(option.value);
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

	refs.gameLobbyCode.textContent = state.session ? `Lobby code: ${state.session.lobbyCode}` : "No lobby connected.";

	renderRoundTimeline(gameState, state.session?.userSecret);
	renderPlayInfo(gameState, localPlayer);
	renderOptions(gameState, localPlayer, setFeedback, renderApp);
	renderScoreboard(state.session?.userSecret, players);
}
