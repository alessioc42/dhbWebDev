let initialized = false;

export function teardownOfflineGame() {
	// Reserved for future offline game cleanup.
}

export function startOfflineGame() {
	if (initialized) {
		return;
	}

	initialized = true;
}
