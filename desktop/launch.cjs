// Tiny launcher that unsets ELECTRON_RUN_AS_NODE (which forces Electron to run as plain Node
// and makes `require('electron')` return a string path instead of the API object) and then
// spawns Electron with `.` as the entry. Kept as a plain .cjs so it runs under node on Windows
// without needing tsx or a build step of its own.

"use strict";
const { spawn } = require("node:child_process");
const { resolve } = require("node:path");

process.env.DESKTOP_DEV = "1";
delete process.env.ELECTRON_RUN_AS_NODE;

const isWin = process.platform === "win32";
const electron = resolve(__dirname, "..", "node_modules", ".bin", isWin ? "electron.cmd" : "electron");
// Windows needs `cmd /c` to launch a .cmd file via spawn without the shell:true + args[] deprecation.
const command = isWin ? "cmd" : electron;
const args = isWin ? ["/c", electron, "."] : ["."];
const child = spawn(command, args, { cwd: __dirname, stdio: "inherit", shell: false, windowsHide: false });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
