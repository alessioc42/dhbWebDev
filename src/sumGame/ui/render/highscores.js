import { applyStatusClass } from "../../../ui/feedback.js";
import { loadHighscores } from "../../app/storage.js";
import { state } from "../../app/state.js";
import { formatScore } from "../format.js";
import { refs } from "../refs.js";

function createCell(text, className) {
	const cell = document.createElement("td");
	if (className) {
		cell.className = className;
	}
	cell.textContent = text;
	return cell;
}

export function renderHighscoreView() {
	applyStatusClass(refs.highscoreStatus, state.feedback.highscores);
	const highscores = loadHighscores();
	refs.highscoreList.innerHTML = "";

	if (highscores.length === 0) {
		const row = document.createElement("tr");
		const cell = document.createElement("td");
		cell.colSpan = 6;
		cell.className = "highscore-table__empty";
		cell.textContent = "No finished games yet.";
		row.append(cell);
		refs.highscoreList.append(row);
		return;
	}

	for (const entry of highscores) {
		const row = document.createElement("tr");
		row.append(
			createCell(new Date(entry.playedAt).toLocaleString()),
			createCell(entry.ownName),
			createCell(entry.opponentName),
			createCell(formatScore(entry.ownScore), "highscore-table__score"),
			createCell(formatScore(entry.opponentScore), "highscore-table__score"),
			createCell(formatScore(entry.highScore), "highscore-table__score highscore-table__score--high"),
		);
		refs.highscoreList.append(row);
	}
}
