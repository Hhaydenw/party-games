import { io } from "socket.io-client";
const BASE = "http://localhost:4141";
function connect(): Promise<any> {
  return new Promise((resolve) => { const s = io(BASE, { path: "/socket.io", transports: ["websocket"] }); s.on("connect", () => resolve(s)); });
}
function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const a = await connect();
  const b = await connect();
  let aView: any = null;
  let aRoom: any = null;
  a.on("game:view", (v: any) => (aView = v));
  a.on("room:state", (r: any) => (aRoom = r));
  a.on("error:message", (m: string) => console.log("A error:", m));
  const createRes: any = await new Promise((resolve) => a.emit("room:create", { name: "Alice" }, resolve));
  const code = createRes.code;
  await new Promise((resolve) => b.emit("room:join", { code, name: "Bob" }, resolve));

  a.emit("room:selectGame", { gameId: "street-snap" });
  a.emit("room:setGameOptions", { options: { rounds: 1, exploreMinutes: 1 } });
  await wait(300);
  console.log("room status before start:", aRoom?.status, "gameId:", aRoom?.gameId, "gameOptions:", aRoom?.gameOptions);
  a.emit("room:startGame");
  await wait(6000);
  console.log("room status after start:", aRoom?.status);
  console.log("phase:", aView?.view?.phase, "city:", aView?.view?.city, "startImageId:", aView?.view?.startImageId);
  console.log("accessToken present in view:", !!aView?.view?.accessToken);

  a.disconnect();
  b.disconnect();
  process.exit(0);
}
main();
