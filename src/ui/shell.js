export function syncOnlineRouteClass(route) {
	document.documentElement.dataset.onlineRoute = route;
}

export function syncGamePhaseClass(phase) {
	if (phase) {
		document.documentElement.dataset.gamePhase = phase;
		return;
	}

	delete document.documentElement.dataset.gamePhase;
}
