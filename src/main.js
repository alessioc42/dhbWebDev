import { GameClient } from "./game-client.js";

const SERVER_HOST =
	globalThis.GAME_SERVER_HOST ||
	new URLSearchParams(window.location.search).get("server") ||
	"http://127.0.0.1:3000";

const app = document.querySelector("#app");

app.innerHTML = `
  <h1>Sample Lobby Messenger</h1>
  <p>Server host: <code id="hostLabel"></code></p>

  <p>
    <label>Username <input id="username" value="Alice" autocomplete="nickname" /></label>
    <label>Lobby code <input id="lobbyCode" maxlength="4" placeholder="ABCD" /></label>
  </p>

  <p>
    <button id="create">Create lobby</button>
    <button id="join">Join lobby</button>
    <button id="disconnect">Disconnect</button>
    <button id="refresh">Refresh lobbies</button>
  </p>

  <p>
    <label>Message <input id="message" value="Hello from the frontend" /></label>
    <button id="push">Send</button>
  </p>

  <p id="status">Idle.</p>

  <h2>Lobbies</h2>
  <ul id="lobbies"></ul>

  <h2>Messages / Events</h2>
  <ul id="log"></ul>
`;

document.querySelector("#hostLabel").textContent = SERVER_HOST;

const client = new GameClient(SERVER_HOST);

const usernameInput = document.querySelector("#username");
const lobbyCodeInput = document.querySelector("#lobbyCode");
const messageInput = document.querySelector("#message");
const statusEl = document.querySelector("#status");
const lobbiesEl = document.querySelector("#lobbies");
const logEl = document.querySelector("#log");

const session = {
	lobbyCode: "",
	userSecret: "",
	stream: null,
};

function setStatus(message) {
	statusEl.textContent = message;
}

function writeLog(message) {
	const item = document.createElement("li");
	item.textContent = message;
	logEl.append(item);
}

function renderLobbies(lobbies) {
	lobbiesEl.innerHTML = "";
	for (const lobby of lobbies) {
		const item = document.createElement("li");
		item.textContent = `${lobby.lobbyCode} - ${lobby.playerCount} player${lobby.playerCount === 1 ? "" : "s"}`;
		lobbiesEl.append(item);
	}
}

async function refreshLobbies() {
	const result = await client.listLobbies();
	renderLobbies(result.lobbies);
}

async function openStream() {
	if (session.stream) {
		session.stream.close();
	}

	session.stream = await client.connectLobby({
		lobbyCode: session.lobbyCode,
		userSecret: session.userSecret,
		onEvent(event) {
			writeLog(`${event.event}: ${JSON.stringify(event.data)}`);
			if (event.event === "lobby_state") {
				lobbyCodeInput.value = event.data.lobbyCode;
			}
		},
	});
}

document.querySelector("#create").addEventListener("click", async () => {
	try {
		const result = await client.createLobby(usernameInput.value);
		session.lobbyCode = result.lobbyCode;
		session.userSecret = result.userSecret;
		lobbyCodeInput.value = result.lobbyCode;
		setStatus(`Created lobby ${result.lobbyCode}. Connecting stream...`);
		await openStream();
		await refreshLobbies();
		setStatus(`Connected as ${result.username} in ${result.lobbyCode}.`);
	} catch (error) {
		setStatus(error.message);
	}
});

document.querySelector("#join").addEventListener("click", async () => {
	try {
		const result = await client.joinLobby(usernameInput.value, lobbyCodeInput.value);
		session.lobbyCode = result.lobbyCode;
		session.userSecret = result.userSecret;
		setStatus(`Joined lobby ${result.lobbyCode}. Connecting stream...`);
		await openStream();
		await refreshLobbies();
		setStatus(`Connected as ${result.username} in ${result.lobbyCode}.`);
	} catch (error) {
		setStatus(error.message);
	}
});

document.querySelector("#push").addEventListener("click", async () => {
	try {
		const result = await client.push(session.userSecret, {
			text: messageInput.value,
		});
		setStatus(`Message sent to ${result.lobbyCode}.`);
	} catch (error) {
		setStatus(error.message);
	}
});

document.querySelector("#refresh").addEventListener("click", async () => {
	try {
		await refreshLobbies();
		setStatus("Lobby list refreshed.");
	} catch (error) {
		setStatus(error.message);
	}
});

document.querySelector("#disconnect").addEventListener("click", () => {
	if (session.stream) {
		session.stream.close();
		session.stream = null;
	}

	session.lobbyCode = "";
	session.userSecret = "";
	setStatus("Stream disconnected.");
});

refreshLobbies().catch((error) => setStatus(error.message));

