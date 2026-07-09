import { parseSiteHash, showGameScreen, syncShellFromHash } from "./site.js";

let activeGame = null;
let onlineModule;
let offlineModule;
let routeToken = 0;

async function routeSite() {
	const token = ++routeToken;
	const { game, legacy, segments } = parseSiteHash(window.location.hash);

	if (legacy) {
		window.location.replace(`#/onlineGame/${segments.join("/")}`);
		return;
	}

	syncShellFromHash();

	if (token !== routeToken) {
		return;
	}

	if (activeGame === "onlineGame" && game !== "onlineGame") {
		onlineModule?.teardownOnlineGame();
	}

	if (activeGame === "offlineGame" && game !== "offlineGame") {
		offlineModule?.teardownOfflineGame();
	}

	showGameScreen(game);
	activeGame = game === "home" ? null : game;

	try {
		if (game === "onlineGame") {
			onlineModule = await import("./onlineGame/main.js");
			if (token !== routeToken) {
				return;
			}
			onlineModule.startOnlineGame();
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
		if (game === "onlineGame") {
			showGameScreen("onlineGame");
			const status = document.getElementById("lobbyStatus");
			if (status) {
				status.textContent = `Failed to load online game: ${error.message}`;
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
