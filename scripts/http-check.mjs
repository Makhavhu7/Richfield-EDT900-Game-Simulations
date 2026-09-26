/**
 * Richfield EDT900 Game Simulations
 * ---------------------------------------------------------------
 * Starts the local Node server (server.mjs) and checks the pages,
 * the account flow and the admin monitor over real HTTP, including
 * the session cookies.
 *
 *   node scripts/http-check.mjs
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
    fileURLToPath(new URL("..", import.meta.url))
);

const port = Number(process.env.CHECK_PORT || 5511);
const base = "http://127.0.0.1:" + port;

// Players created by this check are kept out of the real data folder.
const testDataDir = path.join(root, ".tmp-http-check-data");

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

const server = spawn(
    process.execPath,
    ["server.mjs"],
    {
        cwd: root,

        env: {
            ...process.env,
            PORT: String(port),
            HOST: "127.0.0.1",
            DATA_DIR: testDataDir
        },

        stdio: ["ignore", "pipe", "pipe"]
    }
);

let serverLog = "";

server.stdout.on("data", chunk => {
    serverLog += String(chunk);
});

server.stderr.on("data", chunk => {
    serverLog += String(chunk);
});

async function waitForServer() {
    const deadline = Date.now() + 15000;

    while (Date.now() < deadline) {
        try {
            const response = await fetch(base + "/api/health");

            if (response.ok) {
                return true;
            }
        } catch (error) {
            /* not ready yet */
        }

        await new Promise(resolve => setTimeout(resolve, 250));
    }

    return false;
}

function cookieJar() {
    const jar = new Map();

    function store(response) {
        const headers =
            typeof response.headers.getSetCookie === "function"
                ? response.headers.getSetCookie()
                : [];

        headers.forEach(header => {
            const [pair] = header.split(";");
            const [name, value] = pair.split("=");

            if (value) {
                jar.set(name, value);
            } else {
                jar.delete(name);
            }
        });
    }

    function header() {
        return [...jar.entries()]
            .map(([name, value]) => name + "=" + value)
            .join("; ");
    }

    return { store, header };
}

function player() {
    return cookieJar();
}

function admin() {
    return cookieJar();
}

async function send(method, url, options = {}) {
    const jar = options.jar;

    const headers = {
        ...(options.headers || {})
    };

    if (jar && jar.header()) {
        headers.Cookie = jar.header();
    }

    if (options.body) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(base + url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        redirect: "manual"
    });

    if (jar) {
        jar.store(response);
    }

    const type = response.headers.get("content-type") || "";

    return {
        status: response.status,

        text: await response.text(),
        type
    };
}

console.log(
    "\nRichfield EDT900 - HTTP check\n" +
    "================================\n"
);

if (!(await waitForServer())) {
    console.log(
        "The server did not start. Output:\n" + serverLog
    );

    server.kill();
    process.exit(1);
}

/* -------------------------------- pages -------------------------------- */

console.log("Pages");

const home = await send("GET", "/");

check(
    "The home page is the EDT900 game simulations poster",
    home.status === 200 &&
    home.text.includes(
        "<title>EDT900 Game Simulations | Richfield</title>"
    ) &&
    home.text.includes("CALLING ALL") &&
    home.text.includes("register.html") &&
    home.text.includes(
        "https://showroom.gritlabafrica.org/assets/images/logo.png"
    ),
    home.text.slice(0, 120)
);

const gamePage = await send("GET", "/game.html");

check(
    "The game page serves all three simulations",
    gamePage.status === 200 &&
    gamePage.text.includes("openSim0Game") &&
    gamePage.text.includes("openSim1Game") &&
    gamePage.text.includes("openSim2Game") &&
    gamePage.text.includes("assets/js/quiz-games.js")
);

const guess = await send("GET", "/login");

check(
    "\"/login\" also serves login.html",
    guess.status === 200 &&
    guess.text.includes("Student sign in")
);

for (const page of ["game.html", "login.html", "register.html", "admin.html"]) {
    const response = await send("GET", "/" + page);

    check("The page " + page + " is served", response.status === 200);
}

for (const gone of ["quizzes.html", "day-1.html", "delegates.html"]) {
    const response = await send("GET", "/" + gone);

    check(
        "The removed page " + gone + " is gone",
        response.status === 404
    );
}

const blocked = await send("GET", "/lib/api-core.mjs");

check(
    "Server code cannot be downloaded",
    blocked.status === 404
);

const gameData = await send(
    "GET",
    "/assets/data/EDT900_Simulation_0_AI_Detective.json"
);

check(
    "The simulation data files are served to the browser",
    gameData.status === 200 &&
    gameData.type.includes("application/json")
);

const gameScript = await send("GET", "/assets/js/quiz-games.js");

check(
    "The game script is served",
    gameScript.status === 200 &&
    gameScript.type.includes("javascript")
);

for (const file of [
    "EDT900_Simulation_0_AI_Detective.json",
    "EDT900_Major_Simulation_1_Gauteng_Smart_Supply.json",
    "EDT900_Major_Simulation_2_Africa_2035_Boardroom.json"
]) {
    const content = await send(
        "GET",
        "/assets/data/" + file
    );

    check(
        "The content file " + file + " is served as JSON",
        content.status === 200 &&
        content.type.includes("application/json")
    );
}

for (const asset of [
    "/assets/css/quiz-games.css",
    "/assets/css/theme.css"
]) {
    const response = await send("GET", asset);

    check(
        "The asset " + asset + " is served",
        response.status === 200
    );
}

/* ------------------------------ accounts ------------------------------ */

console.log("\nAccounts and points");

const playerJar = player();
const email = "http-check@example.com";

const register = await send("POST", "/api/register", {
    jar: playerJar,

    body: {
        fullName: "HTTP Check Player",
        email,
        password: "Ghost1234",
        confirmPassword: "Ghost1234",
        remember: true
    }
});

check(
    "A player can register over HTTP",
    register.status === 201 &&
    register.text.includes("HTTP Check Player")
);

const me = await send("GET", "/api/me", { jar: playerJar });

check(
    "The signed-in player can read their own points",
    me.status === 200 &&
    JSON.parse(me.text).user.points.maximum === 660
);

const gameOne = JSON.parse(
    (
        await send(
            "GET",
            "/assets/data/EDT900_Simulation_0_AI_Detective.json"
        )
    ).text
);

const firstPuzzle = gameOne.stages[0].problems_list[0];

const answer = await send("POST", "/api/answers", {
    jar: playerJar,

    body: {
        gameId: "sim0",
        questionId: firstPuzzle.problem_id,
        answer: firstPuzzle.correct_answer
    }
});

check(
    "A correct Simulation 0 answer is scored on the server",
    answer.status === 200 &&
    JSON.parse(answer.text).awarded === 10
);

const gameTwo = JSON.parse(
    (
        await send(
            "GET",
            "/assets/data/EDT900_Major_Simulation_1_Gauteng_Smart_Supply.json"
        )
    ).text
);

const supplyProblem = gameTwo.levels_data[0].problems[0];

const round = await send("POST", "/api/answers", {
    jar: playerJar,

    body: {
        gameId: "sim1",
        questionId: supplyProblem.problem_id,
        answer: supplyProblem.correct_answer
    }
});

check(
    "A correct Simulation 1 answer is scored on the server",
    round.status === 200 &&
    JSON.parse(round.text).awarded === 10
);

const totals = JSON.parse(
    (await send("GET", "/api/me", { jar: playerJar })).text
).user.points;

check(
    "The account keeps 20 of 660 AfriCOIN",
    totals.total === 20 &&
    totals.games.sim0.points === 10 &&
    totals.games.sim1.points === 10,
    JSON.stringify(totals.games)
);

/* -------------------------------- admin -------------------------------- */

console.log("\nAdmin monitor");

const adminJar = admin();

const adminLogin = await send("POST", "/api/admin/login", {
    jar: adminJar,

    body: {
        username: "admin",
        password: "EDT900@2026",
        remember: true
    }
});

check(
    "The admin can sign in",
    adminLogin.status === 200
);

const users = await send("GET", "/api/admin/users", {
    jar: adminJar
});

const usersBody = JSON.parse(users.text);

check(
    "The admin sees the registered student with their AfriCOIN",
    users.status === 200 &&
    usersBody.users.length === 1 &&
    usersBody.users[0].email === email &&
    usersBody.users[0].points.total === 20,
    JSON.stringify(usersBody.summary)
);

const detail = await send(
    "GET",
    "/api/admin/users/" + usersBody.users[0].id,
    { jar: adminJar }
);

check(
    "The admin can see every problem that student answered",
    detail.status === 200 &&
    JSON.parse(detail.text).questions.length === 2
);

const summaryCsv = await send("GET", "/api/admin/users.csv", {
    jar: adminJar
});

check(
    "The students CSV downloads",
    summaryCsv.status === 200 &&
    summaryCsv.type.includes("csv") &&
    summaryCsv.text.includes("HTTP Check Player")
);

const questionsCsv = await send(
    "GET",
    "/api/admin/users.csv?view=questions",
    { jar: adminJar }
);

check(
    "The per-question CSV downloads",
    questionsCsv.status === 200 &&
    questionsCsv.text.includes("Points earned")
);

const personalAdmin = await send("POST", "/api/admin/login", {
    jar: admin(),

    body: {
        username: "mbofhenijunior7@gmail.com",
        password: "GRIT@2026",
        remember: false
    }
});

check(
    "The admin login from data/admins.json works as well",
    personalAdmin.status === 200 &&
    personalAdmin.text.includes("Makhavhu MJ")
);

/* --------------------------- JSON database files --------------------------- */

console.log("\nJSON database files");

const usersFile = JSON.parse(
    fs.readFileSync(
        path.join(testDataDir, "users.json"),
        "utf8"
    )
);

check(
    "Students are stored in data/users.json",
    Array.isArray(usersFile) &&
    usersFile.length === 1 &&
    usersFile[0].email === email &&
    usersFile[0].games.sim0.questions[firstPuzzle.problem_id].best === 10,
    JSON.stringify(usersFile[0] && usersFile[0].games)
);

const adminsFile = JSON.parse(
    fs.readFileSync(
        path.join(testDataDir, "admins.json"),
        "utf8"
    )
);

check(
    "Admin logins are stored in data/admins.json",
    Array.isArray(adminsFile) &&
    adminsFile.length >= 2 &&
    adminsFile.some(
        admin => admin.username === "mbofhenijunior7@gmail.com"
    ) &&
    adminsFile.some(admin => admin.username === "admin")
);

const sessionsFile = JSON.parse(
    fs.readFileSync(
        path.join(testDataDir, "sessions.json"),
        "utf8"
    )
);

check(
    "Sessions are stored in data/sessions.json",
    Object.keys(sessionsFile).some(
        key => key.startsWith("session:")
    ) &&
    Object.keys(sessionsFile).some(
        key => key.startsWith("adminSession:")
    )
);

await send("POST", "/api/logout", { jar: playerJar });

const afterLogout = await send("GET", "/api/me", {
    jar: playerJar
});

check(
    "After signing out the student is no longer signed in",
    afterLogout.status === 401
);

/* ------------------------------- teardown ------------------------------ */

console.log(
    "\n--------------------------------\n" +
    "Passed: " + passed + "\n" +
    "Failed: " + failed + "\n"
);

server.kill();

await new Promise(resolve => setTimeout(resolve, 500));

try {
    fs.rmSync(testDataDir, {
        recursive: true,
        force: true
    });
} catch (error) {
    /* nothing to clean up */
}

process.exit(failed ? 1 : 0);
