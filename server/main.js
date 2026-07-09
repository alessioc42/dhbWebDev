import { GameServer } from "./game.js";

const gameServer = new GameServer();

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);

let info;
try {
    info = await gameServer.listen(port, host);
    console.log("Server listening on", info);
} catch (err) {
    if (err && err.code === "EADDRINUSE") {
        console.warn(`Port ${port} in use; falling back to a dynamic port.`);
        info = await gameServer.listen(0, host);
        console.log("Server listening on", info);
    } else {
        throw err;
    }
}
