import { applyStatusClass, feedbackTone } from "../../../ui/feedback.js";
import { formatLobbySettings } from "../../game-settings.js";
import { state, syncRoundHistoryFromGame } from "../../app/state.js";
import { client } from "../../network/client.js";
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

function renderPlayInfoWaiting(message) {
	const element = refs.gameTargetNumber;
	element.hidden = false;
	element.className = `play-info play-info--waiting status status--${feedbackTone(message)}`;
	element.textContent = message;
}

function createEquationBlock(value, { placeholder = false, variant = "term" } = {}) {
	const block = document.createElement("span");
	block.className = `equation-piece equation-block equation-block--${variant}`;
	if (placeholder) {
		block.classList.add("equation-block--placeholder");
		block.textContent = "0";
		block.setAttribute("aria-label", "0");
	} else {
		block.textContent = String(value);
		block.setAttribute("aria-label", String(value));
	}

	return block;
}

function createEquationOperator(symbol) {
	const operator = document.createElement("span");
	operator.className = "equation-piece equation-operator";
	operator.setAttribute("aria-hidden", "true");
	operator.textContent = symbol;
	return operator;
}

const EQUATION_EXIT_MS = 180;
const EQUATION_ENTER_MS = 220;
const EQUATION_STAGGER_MS = 45;
const EQUATION_SUM_UPDATE_DELAY_MS = 320;

function clearScheduledSumUpdate(expression) {
	const timerId = Number(expression.dataset.sumUpdateTimer);
	if (timerId) {
		window.clearTimeout(timerId);
		delete expression.dataset.sumUpdateTimer;
	}
}

function scheduleSumUpdate(expression, element, piece, delayMs) {
	clearScheduledSumUpdate(expression);

	const timerId = window.setTimeout(() => {
		delete expression.dataset.sumUpdateTimer;
		if (element.isConnected) {
			updateEquationPiece(element, piece);
		}
	}, delayMs);

	expression.dataset.sumUpdateTimer = String(timerId);
}

function insertionAnimationDelay(enterCount) {
	if (enterCount <= 0) {
		return 0;
	}

	return EQUATION_ENTER_MS + Math.max(0, enterCount - 1) * EQUATION_STAGGER_MS + EQUATION_SUM_UPDATE_DELAY_MS;
}

function buildEquationPlan(selectedOptions, sumValue, targetValue) {
	const pieces = [];

	if (selectedOptions.length === 0) {
		pieces.push({
			key: "term:placeholder",
			type: "block",
			variant: "term",
			placeholder: true,
			value: 0,
		});
	} else {
		for (const [index, option] of selectedOptions.entries()) {
			if (index > 0) {
				pieces.push({ key: `op:+:${option.id}`, type: "operator", symbol: "+" });
			}

			pieces.push({
				key: `term:${option.id}`,
				type: "block",
				variant: "term",
				value: option.value,
			});
		}
	}

	pieces.push({ key: "op:=", type: "operator", symbol: "=" });
	pieces.push({ key: "sum", type: "block", variant: "sum", value: sumValue });
	pieces.push({ key: "op:≠", type: "operator", symbol: "≠" });
	pieces.push({ key: "target", type: "block", variant: "target", value: targetValue });

	return pieces;
}

function createEquationPiece(piece, staggerIndex = 0) {
	const element =
		piece.type === "operator"
			? createEquationOperator(piece.symbol)
			: createEquationBlock(piece.value, {
					placeholder: piece.placeholder,
					variant: piece.variant,
				});

	element.dataset.equationKey = piece.key;
	if (staggerIndex > 0) {
		element.style.setProperty("--equation-stagger", `${staggerIndex * 45}ms`);
	}

	element.classList.add("equation-piece--enter");
	element.addEventListener(
		"animationend",
		() => {
			element.classList.remove("equation-piece--enter");
			element.style.removeProperty("--equation-stagger");
		},
		{ once: true },
	);

	return element;
}

function updateEquationPiece(element, piece) {
	if (piece.type === "operator") {
		return;
	}

	const displayValue = piece.placeholder ? "0" : String(piece.value);
	if (element.textContent !== displayValue) {
		element.textContent = displayValue;
		element.setAttribute("aria-label", displayValue);
		element.classList.remove("equation-piece--bump");
		void element.offsetWidth;
		element.classList.add("equation-piece--bump");
	}

	element.classList.toggle("equation-block--placeholder", Boolean(piece.placeholder));
	element.classList.toggle(`equation-block--${piece.variant}`, true);
}

function removeEquationPiece(element, onRemoved) {
	let finished = false;
	const finish = () => {
		if (finished) {
			return;
		}

		finished = true;
		element.remove();
		onRemoved?.();
	};

	element.classList.remove("equation-piece--enter", "equation-piece--bump");
	element.classList.add("equation-piece--exit");
	element.addEventListener("animationend", finish, { once: true });
	window.setTimeout(finish, EQUATION_EXIT_MS);
}

function applyEquationPlan(expression, plan) {
	for (const child of [...expression.children]) {
		if (!child.dataset.equationKey && !child.classList.contains("equation-piece--exit")) {
			child.remove();
		}
	}

	const currentByKey = new Map();
	for (const child of expression.children) {
		const key = child.dataset.equationKey;
		if (key && !child.classList.contains("equation-piece--exit")) {
			currentByKey.set(key, child);
		}
	}

	let enterIndex = 0;
	let sumPiece = null;

	for (const piece of plan) {
		if (piece.key === "sum") {
			sumPiece = piece;
			continue;
		}

		const existing = currentByKey.get(piece.key);
		if (existing?.isConnected) {
			updateEquationPiece(existing, piece);
			expression.append(existing);
			continue;
		}

		expression.append(createEquationPiece(piece, enterIndex));
		enterIndex += 1;
	}

	if (!sumPiece) {
		return;
	}

	const existingSum = currentByKey.get("sum");
	const displayValue = String(sumPiece.value);

	if (existingSum?.isConnected) {
		expression.append(existingSum);

		if (existingSum.textContent === displayValue) {
			clearScheduledSumUpdate(expression);
			return;
		}

		if (enterIndex > 0) {
			scheduleSumUpdate(expression, existingSum, sumPiece, insertionAnimationDelay(enterIndex));
			return;
		}

		clearScheduledSumUpdate(expression);
		updateEquationPiece(existingSum, sumPiece);
		return;
	}

	clearScheduledSumUpdate(expression);
	expression.append(createEquationPiece(sumPiece, enterIndex));
}

function syncEquationExpression(expression, plan) {
	const plannedKeys = new Set(plan.map((piece) => piece.key));
	const toRemove = [...expression.children].filter((child) => {
		const key = child.dataset.equationKey;
		return key && !plannedKeys.has(key) && !child.classList.contains("equation-piece--exit");
	});

	if (toRemove.length === 0) {
		applyEquationPlan(expression, plan);
		return;
	}

	let pending = toRemove.length;
	for (const element of toRemove) {
		removeEquationPiece(element, () => {
			pending -= 1;
			if (pending === 0) {
				applyEquationPlan(expression, plan);
			}
		});
	}
}

function showEquationChain(container) {
	if (!container.hidden) {
		return;
	}

	container.hidden = false;
	container.classList.remove("equation-chain--exit");
	container.classList.add("equation-chain--enter");
	container.addEventListener(
		"animationend",
		() => {
			container.classList.remove("equation-chain--enter");
		},
		{ once: true },
	);
}

function hideEquationChain(container, expression) {
	if (container.hidden || container.dataset.equationExiting === "true") {
		return;
	}

	const pieces = [...expression.children].filter((child) => child.dataset.equationKey);
	if (pieces.length === 0) {
		container.hidden = true;
		expression.replaceChildren();
		return;
	}

	container.dataset.equationExiting = "true";
	container.classList.add("equation-chain--exit");

	let pending = pieces.length;
	const finish = () => {
		pending -= 1;
		if (pending > 0) {
			return;
		}

		delete container.dataset.equationExiting;
		container.classList.remove("equation-chain--exit");
		container.hidden = true;
		expression.replaceChildren();
	};

	for (const element of pieces) {
		removeEquationPiece(element, finish);
	}

	container.addEventListener(
		"animationend",
		() => {
			container.classList.remove("equation-chain--exit");
		},
		{ once: true },
	);
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

	renderPlayInfoWaiting("Waiting for the second player.");
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

	const settingsLabel = formatLobbySettings(state.lobby?.settings);
	const lobbyPrefix = settingsLabel ? `${settingsLabel} · ` : "";
	refs.gameLobbyCode.textContent = state.session
		? `${lobbyPrefix}Lobby code: ${state.session.lobbyCode}`
		: "No lobby connected.";

	renderRoundTimeline(gameState, state.session?.userSecret);
	renderPlayInfo(gameState, localPlayer);
	renderOptions(gameState, localPlayer, setFeedback, renderApp);
	renderEquationChain(gameState, localPlayer);
	renderScoreboard(state.session?.userSecret, players);
}
