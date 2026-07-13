export function syncSumGameRouteClass(route) {
	document.documentElement.dataset.sumGameRoute = route;
}

export function syncGamePhaseClass(phase) {
	if (phase) {
		document.documentElement.dataset.gamePhase = phase;
		return;
	}

	delete document.documentElement.dataset.gamePhase;
}
