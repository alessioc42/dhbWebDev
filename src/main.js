import { parseSiteHash, showGameScreen, syncShellFromHash } from "./site.js";

let activeGame = null;
let sumGameModule;
let routeToken = 0;

async function routeSite() {
	const token = ++routeToken;
	const { game } = parseSiteHash(window.location.hash);

	syncShellFromHash();

	if (token !== routeToken) {
		return;
	}

	if (activeGame === "sumGame" && game !== "sumGame") {
		sumGameModule?.teardownSumGame();
	}

	showGameScreen(game);
	activeGame = game === "home" ? null : game;

	if (game !== "sumGame") {
		return;
	}

	try {
		sumGameModule = await import("./sumGame/main.js");
		if (token !== routeToken) {
			return;
		}
		sumGameModule.startSumGame();
	} catch (error) {
		if (token !== routeToken) {
			return;
		}

		console.error("Failed to load game module:", error);
		showGameScreen("sumGame");
		const status = document.getElementById("lobbyStatus");
		if (status) {
			status.textContent = `Rechenrennen konnte nicht geladen werden: ${error.message}`;
		}
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
