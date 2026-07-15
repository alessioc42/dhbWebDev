export const DEFAULT_TOTAL_ROUNDS = 5;
export const MIN_TOTAL_ROUNDS = 3;
export const MAX_TOTAL_ROUNDS = 10;

export const DIFFICULTY_OPTIONS = [
	{ id: "easy", label: "Leicht (0–30)", min: 0, max: 30 },
	{ id: "medium", label: "Mittel (0–70)", min: 0, max: 70 },
	{ id: "hard", label: "Schwer (0–100)", min: 0, max: 100 },
	{ id: "expert", label: "Experte (−100–100)", min: -100, max: 100 },
];

export function formatLobbySettings(settings) {
	if (!settings) {
		return "";
	}

	const difficulty = DIFFICULTY_OPTIONS.find((option) => option.id === settings.difficulty);
	const rangeLabel = difficulty ? difficulty.label : settings.difficulty;
	return `${settings.totalRounds} Runden · ${rangeLabel}`;
}

export function readCreateLobbySettings(refs) {
	const totalRounds = Number(refs.roundsInput?.value ?? DEFAULT_TOTAL_ROUNDS);
	const difficulty = refs.difficultyInput?.value ?? "medium";

	return {
		totalRounds: Math.min(MAX_TOTAL_ROUNDS, Math.max(MIN_TOTAL_ROUNDS, totalRounds)),
		difficulty,
	};
}
