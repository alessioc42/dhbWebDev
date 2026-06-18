import { GameServer } from "./game.js";

const gameServer = new GameServer();

let info;
try {
    info = await gameServer.listen(3000, "127.0.0.1");
    console.log("Server listening on", info);
} catch (err) {
    if (err && err.code === "EADDRINUSE") {
        console.warn("Port 3000 in use; falling back to a dynamic port.");
        info = await gameServer.listen(0, "127.0.0.1");
        console.log("Server listening on", info);
    } else {
        throw err;
    }
}
