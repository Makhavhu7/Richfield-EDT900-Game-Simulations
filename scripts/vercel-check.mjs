/**
 * Richfield EDT900 Game Simulations
 * ---------------------------------------------------------------
 * Checks the Vercel function (api/[...route].mjs) the way Vercel
 * runs it:
 *
 *   1. bundles it with esbuild (the same bundler Vercel uses)
 *   2. starts a small stand-in for the Upstash / Vercel KV REST API
 *   3. sends the real requests through the function handler
 *
 *   node scripts/vercel-check.mjs
 */

import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

const root = path.resolve(
    fileURLToPath(new URL("..", import.meta.url))
);

const outDir = path.join(root, ".tmp-vercel-check");
const bundle = path.join(outDir, "api.mjs");

const token = "test-kv-token";

let passed = 0;
let failed = 0;

function check(title, condition, detail) {
    if (condition) {
        passed += 1;
        console.log("  PASS  " + title);

        return;
    }

    failed += 1;

    console.log(
        "  FAIL  " + title +
        (detail ? "  -> " + detail : "")
    );
}

/* -------------------- stand-in for the hosted key/value store -------------------- */

const store = new Map();

const kvServer = createServer((request, response) => {
    const url = new URL(
        request.url,
        "http://localhost"
    );

    const parts = url.pathname
        .split("/")
        .filter(Boolean);

    const command = parts[0];
    const key = decodeURIComponent(parts.slice(1).join("/"));

    const reply = payload => {
        response.writeHead(200, {
            "content-type": "application/json"
        });

        response.end(JSON.stringify(payload));
    };

    if (request.headers.authorization !== "Bearer " + token) {
        response.writeHead(401, {
            "content-type": "application/json"
        });

        response.end(JSON.stringify({ error: "unauthorized" }));

        return;
    }

    if (command === "get") {
        reply({
            result: store.has(key)
                ? store.get(key)
                : null
        });

        return;
    }

    if (command === "set") {
        let body = "";

        request.on("data", chunk => {
            body += chunk;
        });

        request.on("end", () => {
            store.set(key, body);

            reply({ result: "OK" });
        });

        return;
    }

    if (command === "del") {
        store.delete(key);

        reply({ result: 1 });

        return;
    }

    response.writeHead(404, {
        "content-type": "application/json"
    });

    response.end(JSON.stringify({ error: "unknown command" }));
});

await new Promise(resolve => kvServer.listen(0, "127.0.0.1", resolve));

const kvUrl =
    "http://127.0.0.1:" +
    kvServer.address().port;

process.env.KV_REST_API_URL = kvUrl;
process.env.KV_REST_API_TOKEN = token;

/* ------------------------------- bundle ------------------------------- */

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

await esbuild.build({
    entryPoints: [
        path.join(root, "api", "[...route].mjs")
    ],

    outfile: bundle,
    bundle: true,
    platform: "node",
    format: "esm",
    logLevel: "silent"
});

const { default: handler } = await import(
    "file://" + bundle.replaceAll("\\", "/")
);

/* --------------------------- request helper --------------------------- */

function invoke(method, url, options = {}) {
    return new Promise((resolve, reject) => {
        const headers = {
            host: "edt900-game-simulations.vercel.app"
        };

        if (options.cookie) {
            headers.cookie = options.cookie;
        }

        const response = {
            statusCode: 0,
            headers: {},

            setHeader(name, value) {
                this.headers[String(name).toLowerCase()] = value;
            }
        };

        const request = {
            method,
            url,
            headers,

            query: {},
            body: options.body
        };

        response.end = text => {
            resolve({
                status: response.statusCode,
                headers: response.headers,
                text: String(text ?? "")
            });
        };

        Promise.resolve(handler(request, response))
            .catch(reject);
    });
}

function jar() {
    let cookie = "";

    return {
        get() {
            return cookie;
        },

        capture(response) {
            const raw = response.headers["set-cookie"];

            if (raw) {
                cookie = String(raw).split(";")[0];
            }
        }
    };
}

/* -------------------------------- checks -------------------------------- */

console.log(
    "\nRichfield EDT900 - Vercel function check\n" +
    "===========================================\n"
);

const health = await invoke("GET", "/api/health");

check(
    "GET /api/health answers through the Vercel function",
    health.status === 200 &&
    JSON.parse(health.text).maximumTotal === 660,
    health.text.slice(0, 120)
);

const player = jar();

const register = await invoke("POST", "/api/register", {
    body: {
        fullName: "Vercel Check Player",
        email: "vercel-check@example.com",
        password: "Ghost1234",
        confirmPassword: "Ghost1234",
        remember: true
    }
});

player.capture(register);

check(
    "A player can register and the account is written to the store",
    register.status === 201 &&
    player.get().startsWith("edt900_sid=") &&
    store.has("user:u1"),
    register.text.slice(0, 120)
);

const me = await invoke("GET", "/api/me", {
    cookie: player.get()
});

check(
    "The signed-in player can read their own account",
    me.status === 200 &&
    JSON.parse(me.text).user.email === "vercel-check@example.com"
);

const gameOne = JSON.parse(
    fs.readFileSync(
        path.join(
            root,
            "assets/data/EDT900_Simulation_0_AI_Detective.json"
        ),
        "utf8"
    )
);

const puzzle = gameOne.stages[0].problems_list[0];

const answer = await invoke("POST", "/api/answers", {
    cookie: player.get(),

    body: {
        gameId: "sim0",
        questionId: puzzle.problem_id,
        answer: puzzle.correct_answer
    }
});

check(
    "A correct Simulation 0 answer is scored on the server",
    answer.status === 200 &&
    JSON.parse(answer.text).awarded === 10,
    answer.text.slice(0, 120)
);

const admin = jar();

const adminLogin = await invoke("POST", "/api/admin/login", {
    body: {
        username: "admin",
        password: "EDT900@2026",
        remember: true
    }
});

admin.capture(adminLogin);

check(
    "The admin can sign in",
    adminLogin.status === 200
);

const users = await invoke("GET", "/api/admin/users", {
    cookie: admin.get()
});

const usersBody = JSON.parse(users.text);

check(
    "The admin sees every registered player with their points",
    users.status === 200 &&
    usersBody.users.length === 1 &&
    usersBody.users[0].points.total === 10,
    users.text.slice(0, 160)
);

const summaryCsv = await invoke(
    "GET",
    "/api/admin/users.csv?view=questions",
    { cookie: admin.get() }
);

check(
    "The CSV export streams through the function",
    summaryCsv.status === 200 &&
    summaryCsv.text.includes("Points earned") &&
    summaryCsv.text.includes("Vercel Check Player")
);

const unknown = await invoke("GET", "/api/nope");

check(
    "Unknown API routes answer with 404",
    unknown.status === 404
);

const stored = JSON.parse(store.get("user:u1"));

check(
    "The stored player keeps the per-problem AfriCOIN",
    stored.games.sim0.questions[puzzle.problem_id].best === 10
);

const blocked = await invoke("GET", "/api/me");

check(
    "Without a session the API answers 401",
    blocked.status === 401
);

/* --------------------------- published files -------------------------- */

const styleCss = await invoke("GET", "/assets/css/style.css");

check(
    "GET /assets/css/style.css is served by the function",
    styleCss.status === 200 &&
    String(styleCss.headers["content-type"] || "")
        .startsWith("text/css") &&
    styleCss.text.includes(":root"),
    styleCss.status + " " +
    styleCss.headers["content-type"] +
    " len " + styleCss.text.length
);

const themeCss = await invoke("GET", "/api/assets/css/theme.css");

check(
    "The /assets rewrite shape (/api/assets/...) also works",
    themeCss.status === 200 &&
    String(themeCss.headers["content-type"] || "")
        .startsWith("text/css"),
    themeCss.status + " " + themeCss.headers["content-type"]
);

const quizJs = await invoke("GET", "/api/assets/js/quiz-games.js");

check(
    "Scripts travel to the function too",
    quizJs.status === 200 &&
    quizJs.text.includes("EDT900"),
    quizJs.status + " len " + quizJs.text.length
);

const gamePage = await invoke("GET", "/api/pages/game");

check(
    "The /game rewrite shape (/api/pages/game) serves game.html",
    gamePage.status === 200 &&
    String(gamePage.headers["content-type"] || "")
        .startsWith("text/html") &&
    gamePage.text.includes("EDT900"),
    gamePage.status + " " + gamePage.headers["content-type"]
);

const gameHtml = await invoke("GET", "/game.html");

check(
    "A direct game.html request is served as well",
    gameHtml.status === 200 &&
    gameHtml.text.includes("EDT900"),
    gameHtml.status + " len " + gameHtml.text.length
);

const simData = await invoke(
    "GET",
    "/assets/data/EDT900_Simulation_0_AI_Detective.json"
);

let simDataOk = false;

try {
    simDataOk = Boolean(
        JSON.parse(simData.text)
    );
} catch (error) {
    simDataOk = false;
}

check(
    "Simulation data is readable from the function bundle",
    simData.status === 200 &&
    String(simData.headers["content-type"] || "")
        .startsWith("application/json") &&
    simDataOk,
    simData.status + " " + simData.headers["content-type"]
);

const unknownApi = await invoke("GET", "/api/definitely-not-a-route");

check(
    "Unknown API routes still answer with a JSON 404",
    unknownApi.status === 404 &&
    String(unknownApi.headers["content-type"] || "")
        .startsWith("application/json"),
    unknownApi.status + " " + unknownApi.text.slice(0, 80)
);

const traversal = await invoke(
    "GET",
    "/api/pages/..%2F..%2Fpackage.json"
);

check(
    "Path traversal outside the published folder is refused",
    traversal.status === 404,
    traversal.status + " " + traversal.text.slice(0, 80)
);

const dotDot = await invoke("GET", "/api/pages/../package.json");

check(
    "A dotted path is refused as well",
    dotDot.status === 404,
    dotDot.status + " " + dotDot.text.slice(0, 80)
);

const debugHealth = await invoke("GET", "/api/health?debug=1");

let debugReport = null;

try {
    debugReport = JSON.parse(debugHealth.text).published || null;
} catch (error) {
    debugReport = null;
}

check(
    "GET /api/health?debug=1 reports the published files",
    debugHealth.status === 200 &&
    debugReport !== null &&
    debugReport.files["assets/css/style.css"] === true &&
    debugReport.files["index.html"] === true,
    debugHealth.status + " " +
    JSON.stringify(debugReport).slice(0, 200)
);

const plainHealth = await invoke("GET", "/api/health");

check(
    "The plain health reply stays free of debug data",
    plainHealth.status === 200 &&
    JSON.parse(plainHealth.text).published === undefined,
    plainHealth.text.slice(0, 120)
);

/* --------------------------- static publishing --------------------------- */

const REQUIRED_PUBLISHED = [
    "index.html",
    "game.html",
    "login.html",
    "register.html",
    "admin.html",
    "assets/css/style.css",
    "assets/css/theme.css",
    "assets/css/auth.css",
    "assets/css/quiz-games.css",
    "assets/js/quiz-games.js",
    "assets/js/api-client.js",
    "assets/js/local-db.js",
    "assets/js/admin.js",
    "assets/data/EDT900_Simulation_0_AI_Detective.json",
    "assets/data/EDT900_Major_Simulation_1_Gauteng_Smart_Supply.json",
    "assets/data/EDT900_Major_Simulation_2_Africa_2035_Boardroom.json"
];

const vercelConfig = JSON.parse(
    fs.readFileSync(path.join(root, "vercel.json"), "utf8")
);

check(
    "vercel.json publishes the assembled public folder",
    vercelConfig.buildCommand === "node scripts/build-vercel.mjs" &&
    vercelConfig.outputDirectory === "public",
    JSON.stringify({
        buildCommand: vercelConfig.buildCommand,
        outputDirectory: vercelConfig.outputDirectory
    })
);

const functionKey =
    Object.keys(vercelConfig.functions || {})[0] || "";

const functionFile = "api/[...route].mjs";

const functionMatches = typeof fs.globSync === "function"
    ? fs.globSync(functionKey, { cwd: root })
        .map(name => String(name).replaceAll("\\", "/"))
    : [];

check(
    "vercel.json's functions key matches the Vercel function file",
    functionKey !== "" &&
    fs.existsSync(path.join(root, functionFile)) &&
    (
        functionMatches.length === 0 ||
        functionMatches.includes(functionFile)
    ),
    functionKey + " -> " + functionMatches.join(", ")
);

const functionConfig =
    vercelConfig.functions?.[functionKey] || {};

const bundleUrl = "file://" + path
    .join(root, "lib", "published-bundle.mjs")
    .replaceAll("\\", "/");

const { PUBLISHED_FILES } = await import(bundleUrl);

const carried = Object.keys(PUBLISHED_FILES || {});

const stale = REQUIRED_PUBLISHED.filter(
    name =>
        !PUBLISHED_FILES ||
        PUBLISHED_FILES[name] !==
        fs.readFileSync(path.join(root, name), "utf8")
);

check(
    "The function carries a copy of every page and asset",
    REQUIRED_PUBLISHED.every(name => carried.includes(name)),
    carried.length + " files: " + carried.join(", ")
);

check(
    "That copy matches the files on disk (run npm run build:vercel)",
    stale.length === 0,
    stale.join(", ")
);

const { createApi } = await import(
    "file://" + path
        .join(root, "lib", "api-core.mjs")
        .replaceAll("\\", "/")
);

const { buildCatalog } = await import(
    "file://" + path
        .join(root, "lib", "game-catalog.mjs")
        .replaceAll("\\", "/")
);

function readSim(name) {
    return JSON.parse(
        fs.readFileSync(
            path.join(root, "assets", "data", name),
            "utf8"
        )
    );
}

const bundleOnlyApi = createApi({
    catalog: buildCatalog({
        sim0: readSim("EDT900_Simulation_0_AI_Detective.json"),

        sim1: readSim(
            "EDT900_Major_Simulation_1_Gauteng_Smart_Supply.json"
        ),

        sim2: readSim(
            "EDT900_Major_Simulation_2_Africa_2035_Boardroom.json"
        )
    }),

    kv: {
        get: async () => null,
        set: async () => true,
        del: async () => true
    },

    config: {
        publishedFiles: PUBLISHED_FILES
    }
});

const bundleOnlyCss = await bundleOnlyApi.handle({
    method: "GET",
    path: "/assets/css/theme.css"
});

check(
    "The copy alone is enough to serve a stylesheet",
    bundleOnlyCss.status === 200 &&
    String(bundleOnlyCss.headers["content-type"] || "")
        .startsWith("text/css") &&
    bundleOnlyCss.text.length > 100,
    bundleOnlyCss.status + " len " +
    String(bundleOnlyCss.text || "").length
);

const bundleOnlyPage = await bundleOnlyApi.handle({
    method: "GET",
    path: "/api/pages/admin"
});

check(
    "The copy alone is enough to serve a page",
    bundleOnlyPage.status === 200 &&
    bundleOnlyPage.text.includes("EDT900"),
    bundleOnlyPage.status + " len " +
    String(bundleOnlyPage.text || "").length
);

const bundleOnlyMissing = await bundleOnlyApi.handle({
    method: "GET",
    path: "/assets/css/does-not-exist.css"
});

check(
    "A file that is not in the copy still answers 404",
    bundleOnlyMissing.status === 404,
    bundleOnlyMissing.status + " " +
    String(bundleOnlyMissing.text || "").slice(0, 80)
);

check(
    "maxDuration and memory stay configured for the function",
    Number(functionConfig.maxDuration) > 0 &&
    Number(functionConfig.memory) > 0,
    JSON.stringify(functionConfig)
);

check(
    "vercel.json routes the pages and assets through the function",
    (vercelConfig.rewrites || []).some(row =>
        String(row.source).startsWith("/assets/")
    ) &&
    (vercelConfig.rewrites || []).some(row =>
        String(row.source) === "/game"
    ) &&
    (vercelConfig.rewrites || []).some(row =>
        String(row.source) === "/admin"
    ),
    JSON.stringify(vercelConfig.rewrites || [])
);

const build = spawnSync(
    process.execPath,
    ["scripts/build-vercel.mjs"],
    { cwd: root, encoding: "utf8" }
);

check(
    "The static bundle builds and verifies every required file",
    build.status === 0 &&
    /required files verified/.test(build.stdout || ""),
    (build.stdout || "") + (build.stderr || "")
);

const published = [
    "index.html",
    "game.html",
    "login.html",
    "register.html",
    "admin.html",
    "assets/css/style.css",
    "assets/css/theme.css",
    "assets/css/auth.css",
    "assets/css/quiz-games.css",
    "assets/js/quiz-games.js",
    "assets/js/api-client.js",
    "assets/js/local-db.js",
    "assets/js/admin.js"
];

const missingPublished = published.filter(
    name => !fs.existsSync(path.join(root, "public", name))
);

check(
    "The published folder holds every page, stylesheet and script",
    missingPublished.length === 0,
    missingPublished.join(", ")
);

/* ------------------------------- teardown ------------------------------ */

console.log(
    "\n-------------------------------------------\n" +
    "Passed: " + passed + "\n" +
    "Failed: " + failed + "\n"
);

kvServer.close();

fs.rmSync(outDir, { recursive: true, force: true });

process.exit(failed ? 1 : 0);
