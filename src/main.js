import { parseSiteHash, showGameScreen, syncShellFromHash } from "./site.js";

let activeGame = null;
let sumGameModule;
let offlineModule;
let routeToken = 0;

async function routeSite() {
	const token = ++routeToken;
	const { game, legacy, segments } = parseSiteHash(window.location.hash);

	if (legacy) {
		window.location.replace(`#/sumGame/${segments.join("/")}`);
		return;
	}

	syncShellFromHash();

	if (token !== routeToken) {
		return;
	}

	if (activeGame === "sumGame" && game !== "sumGame") {
		sumGameModule?.teardownSumGame();
	}

	if (activeGame === "offlineGame" && game !== "offlineGame") {
		offlineModule?.teardownOfflineGame();
	}

	showGameScreen(game);
	activeGame = game === "home" ? null : game;

	try {
		if (game === "sumGame") {
			sumGameModule = await import("./sumGame/main.js");
			if (token !== routeToken) {
				return;
			}
			sumGameModule.startSumGame();
			return;
		}

		if (game === "offlineGame") {
			offlineModule = await import("./offlineGame/main.js");
			if (token !== routeToken) {
				return;
			}
			offlineModule.startOfflineGame();
		}
	} catch (error) {
		if (token !== routeToken) {
			return;
		}

		console.error("Failed to load game module:", error);
		if (game === "sumGame") {
			showGameScreen("sumGame");
			const status = document.getElementById("lobbyStatus");
			if (status) {
				status.textContent = `Failed to load Calculator race: ${error.message}`;
			}
			return;
		}

		showGameScreen("home");
		activeGame = null;
		window.location.replace("#/");
	}
}

function bootSite() {
	if (!window.location.hash || window.location.hash === "#") {
		window.location.replace("#/");
	}

	syncShellFromHash();
	void routeSite();
}

window.addEventListener("hashchange", () => {
	syncShellFromHash();
	void routeSite();
});

window.addEventListener("pageshow", () => {
	syncShellFromHash();
	void routeSite();
});

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", bootSite);
} else {
	bootSite();
}
