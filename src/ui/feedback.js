const ERROR_PATTERN = /enter a name|failed|error|unable|invalid|timed out/i;
const SUCCESS_PATTERN = /joined|created|finished|won|round \d+ won|left the lobby/i;
const IDLE_PATTERN = /^(ready\.|idle\.|waiting)/i;
const NEUTRAL_PATTERN = /^(ready\.|idle\.|stored games\.)?$/i;

export function isNeutralFeedback(message) {
	const text = typeof message === "string" ? message.trim() : "";
	return NEUTRAL_PATTERN.test(text);
}

export function feedbackTone(message) {
	if (!message || isNeutralFeedback(message)) {
		return "idle";
	}

	if (ERROR_PATTERN.test(message)) {
		return "error";
	}

	if (SUCCESS_PATTERN.test(message)) {
		return "success";
	}

	if (IDLE_PATTERN.test(message)) {
		return "idle";
	}

	return "info";
}

export function applyStatusClass(element, message) {
	if (!element) {
		return;
	}

	const text = typeof message === "string" ? message.trim() : "";
	if (isNeutralFeedback(text)) {
		element.hidden = true;
		element.textContent = "";
		element.className = "status status--idle";
		return;
	}

	element.hidden = false;
	const tone = feedbackTone(text);
	element.className = `status status--${tone}`;
	element.textContent = text;
}
