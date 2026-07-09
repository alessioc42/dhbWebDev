import { state } from "../app/state.js";

export function formatScore(value) {
	return Number(value || 0).toFixed(2);
}

export function formatRoundValue(value) {
	return String(Math.trunc(Number(value) || 0));
}

export function roundDifference(target, value) {
	return Math.trunc(Number(target) || 0) - Math.trunc(Number(value) || 0);
}

export function formatSignedDifference(target, value) {
	const difference = roundDifference(target, value);
	if (difference > 0) {
		return { sign: "+", amount: String(difference) };
	}
	if (difference < 0) {
		return { sign: "-", amount: String(Math.abs(difference)) };
	}
	return { sign: "+", amount: "0" };
}

export function formatRoundDifference(target, value) {
	const { sign, amount } = formatSignedDifference(target, value);
	return `${sign}${amount}`;
}

export function currentPlayer(gameState = state.game) {
	if (!gameState || !state.session) {
		return null;
	}

	return gameState.players.find((player) => player.userSecret === state.session.userSecret) || null;
}

export function formatRoundResult(result) {
	if (!result) {
		return "";
	}

	return `Round ${result.roundNumber} won by ${result.winner.username} with ${formatScore(result.roundScore)} points in ${formatScore(result.durationSeconds)} seconds.`;
}
