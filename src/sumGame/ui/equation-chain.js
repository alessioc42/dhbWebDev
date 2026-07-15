const EQUATION_EXIT_MS = 180;
const EQUATION_ENTER_MS = 220;
const EQUATION_STAGGER_MS = 45;
const EQUATION_SUM_UPDATE_DELAY_MS = 320;

function createEquationBlock(value, { placeholder = false, variant = "term" } = {}) {
	const block = document.createElement("span");
	block.className = `equation-piece equation-block equation-block--${variant}`;
	block.setAttribute("aria-hidden", "true");
	if (placeholder) {
		block.classList.add("equation-block--placeholder");
		block.textContent = "0";
	} else {
		block.textContent = String(value);
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

export function buildEquationPlan(selectedOptions, sumValue, targetValue) {
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

export function describeEquationPlan(plan) {
	const spoken = [];

	for (const piece of plan) {
		if (piece.type === "block") {
			spoken.push(piece.placeholder ? "0" : String(piece.value));
			continue;
		}

		if (piece.symbol === "+") {
			spoken.push("plus");
		} else if (piece.symbol === "=") {
			spoken.push("gleich");
		} else if (piece.symbol === "≠") {
			spoken.push("ungleich Ziel");
		}
	}

	return spoken.join(" ");
}

function syncEquationAccessibility(expression, plan) {
	expression.setAttribute("aria-label", describeEquationPlan(plan));

	for (const child of expression.children) {
		child.setAttribute("aria-hidden", "true");
	}
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

function readRetainedPieces(expression) {
	const retained = new Map();
	for (const child of expression.children) {
		const key = child.dataset.equationKey;
		if (key && !child.classList.contains("equation-piece--exit")) {
			retained.set(key, child);
		}
	}

	return retained;
}

export function applyEquationPlan(expression, plan) {
	clearScheduledSumUpdate(expression);

	const plannedKeys = new Set(plan.map((piece) => piece.key));
	const retained = readRetainedPieces(expression);

	for (const [key, element] of retained) {
		if (!plannedKeys.has(key)) {
			element.remove();
			retained.delete(key);
		}
	}

	let enterIndex = 0;
	let hadNewPieces = false;
	let deferredSum = null;
	const ordered = [];

	for (const piece of plan) {
		let element = retained.get(piece.key);
		const isNew = !element;

		if (isNew) {
			element = createEquationPiece(piece, enterIndex);
			enterIndex += 1;
			hadNewPieces = true;
		} else {
			retained.delete(piece.key);

			if (piece.type === "block" && piece.key === "sum") {
				const displayValue = String(piece.value);
				if (element.textContent !== displayValue) {
					if (hadNewPieces) {
						deferredSum = { element, piece };
					} else {
						updateEquationPiece(element, piece);
					}
				}
			} else if (piece.type === "block") {
				updateEquationPiece(element, piece);
			}
		}

		ordered.push(element);
	}

	expression.replaceChildren(...ordered);

	if (deferredSum) {
		scheduleSumUpdate(expression, deferredSum.element, deferredSum.piece, insertionAnimationDelay(enterIndex));
	}

	syncEquationAccessibility(expression, plan);
}

export function syncEquationExpression(expression, plan) {
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

export function describeEquationExpression(expression) {
	return [...expression.children].map((child) => {
		const key = child.dataset.equationKey || "?";
		if (key.startsWith("op:")) {
			return child.textContent;
		}

		return `[${child.textContent}]`;
	});
}

export function showEquationChain(container) {
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

export function hideEquationChain(container, expression) {
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
