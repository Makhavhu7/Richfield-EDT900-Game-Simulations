/**
 * Richfield EDT900 Game Simulations
 * ---------------------------------------------------------------
 * End-to-end check of the shared API: accounts, server-side scoring
 * and the admin views. Runs without any dependency and without a
 * network connection, using an in-memory store.
 *
 *   node scripts/smoke-test.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildCatalog } from "../lib/game-catalog.mjs";
import { createApi } from "../lib/api-core.mjs";

const root = path.resolve(
    fileURLToPath(new URL("..", import.meta.url))
);

function readGameFile(name) {
    return JSON.parse(
        fs.readFileSync(
            path.join(root, "assets", "data", name),
            "utf8"
        )
    );
}

const catalog = buildCatalog({
    sim0: readGameFile(
        "EDT900_Simulation_0_AI_Detective.json"
    ),

    sim1: readGameFile(
        "EDT900_Major_Simulation_1_Gauteng_Smart_Supply.json"
    ),

    sim2: readGameFile(
        "EDT900_Major_Simulation_2_Africa_2035_Boardroom.json"
    )
});

function memoryStore() {
    const map = new Map();

    return {
        async get(key) {
            return map.has(key)
                ? structuredClone(map.get(key))
                : null;
        },

        async set(key, value) {
            map.set(key, structuredClone(value));

            return true;
        },

        async remove(key) {
            map.delete(key);

            return true;
        }
    };
}

const api = createApi({
    catalog,
    kv: memoryStore(),
    config: {
        adminUsername: "admin",
        adminPassword: "EDT900@2026"
    }
});

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

async function call(method, url, options = {}) {
    const response = await api.handle({
        method,
        path: url.split("?")[0],

        query: Object.fromEntries(
            new URLSearchParams(
                url.split("?")[1] || ""
            )
        ),

        body: options.body || null,
        cookie: options.cookie || "",
        secure: false
    });

    const setCookie =
        response.headers?.["set-cookie"] ||
        response.headers?.["Set-Cookie"] ||
        "";

    return {
        status: response.status,
        body: response.json ?? response.text,
        headers: response.headers || {},

        cookie:
            options.cookie ||
            setCookie.split(";")[0] ||
            ""
    };
}

function questionFrom(gameId, questionId) {
    return catalog.games[gameId].questions[questionId];
}

console.log(
    "\nRichfield EDT900 - API smoke test\n" +
    "=====================================\n"
);

/* ------------------------------ catalogue ------------------------------ */

console.log("Catalogue");

check(
    "Simulation 0 has 15 problems worth 300 AfriCOIN",
    catalog.games.sim0.questionCount === 15 &&
    catalog.games.sim0.maximum === 300,
    JSON.stringify({
        problems: catalog.games.sim0.questionCount,
        maximum: catalog.games.sim0.maximum
    })
);

check(
    "Simulation 1 has 9 problems worth 180 AfriCOIN",
    catalog.games.sim1.questionCount === 9 &&
    catalog.games.sim1.maximum === 180,

    JSON.stringify({
        problems: catalog.games.sim1.questionCount,
        maximum: catalog.games.sim1.maximum
    })
);

check(
    "Simulation 2 has 9 problems worth 180 AfriCOIN",
    catalog.games.sim2.questionCount === 9 &&
    catalog.games.sim2.maximum === 180,

    JSON.stringify({
        problems: catalog.games.sim2.questionCount,
        maximum: catalog.games.sim2.maximum
    })
);

check(
    "Total maximum is 660 AfriCOIN",
    catalog.maximumTotal === 660,
    String(catalog.maximumTotal)
);

/* -------------------------------- health -------------------------------- */

const health = await call("GET", "/api/health");

check(
    "GET /api/health answers with the three simulations",
    health.status === 200 &&
    health.body.ok === true &&
    health.body.games.length === 3
);

/* ------------------------------ accounts ------------------------------- */

console.log("\nAccounts");

const weak = await call("POST", "/api/register", {
    body: {
        fullName: "Weak Password",
        email: "weak@example.com",
        password: "short",
        confirmPassword: "short"
    }
});

check(
    "A weak password is refused",
    weak.status === 400 &&
    /password/i.test(weak.body.message || "")
);

const register = await call("POST", "/api/register", {
    body: {
        fullName: "Thandi Mwale",
        email: "Thandi@Richfield.ac.za",
        password: "Ghost1234",
        confirmPassword: "Ghost1234",
        remember: true
    }
});

check(
    "A new account is created and signed in",
    register.status === 201 &&
    register.body.ok === true &&
    register.body.user.email === "Thandi@Richfield.ac.za" &&
    register.cookie.startsWith("edt900_sid=")
);

let cookie = register.cookie;

const duplicate = await call("POST", "/api/register", {
    body: {
        fullName: "Thandi Mwale",
        email: "thandi@richfield.ac.za",
        password: "Ghost1234",
        confirmPassword: "Ghost1234"
    }
});

check(
    "A duplicate email (different case) is refused",
    duplicate.status === 409
);

const wrongPassword = await call("POST", "/api/login", {
    body: {
        email: "thandi@richfield.ac.za",
        password: "Wrong12345"
    }
});

check(
    "A wrong password is refused",
    wrongPassword.status === 401
);

const login = await call("POST", "/api/login", {
    body: {
        email: "thandi@richfield.ac.za",
        password: "Ghost1234",
        remember: false
    }
});

check(
    "Signing in works with the correct password",
    login.status === 200 &&
    login.body.ok === true,
    JSON.stringify(login.body)
);

const me = await call("GET", "/api/me", { cookie });

check(
    "GET /api/me returns the account with 0 of 660 AfriCOIN",
    me.status === 200 &&
    me.body.user.points.total === 0 &&
    me.body.user.points.maximum === 660,
    JSON.stringify(me.body)
);

const anonymousAnswers = await call("POST", "/api/answers", {
    body: {
        gameId: "sim0",
        questionId: "S1P1",
        answer: "C"
    }
});

check(
    "Answers cannot be scored without a signed-in student",
    anonymousAnswers.status === 401
);

/* ------------------------------- scoring ------------------------------- */

console.log("\nScoring");

const firstQuestion = questionFrom("sim0", "S1P1");
const rightAnswer = firstQuestion.answer;

const wrongAnswer =
    rightAnswer === "A"
        ? "B"
        : "A";

const firstAnswer = await call("POST", "/api/answers", {
    cookie,

    body: {
        gameId: "sim0",
        questionId: "S1P1",
        answer: rightAnswer
    }
});

check(
    "A correct Simulation 0 answer scores 10 AfriCOIN",
    firstAnswer.status === 200 &&
    firstAnswer.body.awarded === 10 &&
    firstAnswer.body.correct === true &&
    firstAnswer.body.user.points.games.sim0.points === 10,
    JSON.stringify(firstAnswer.body.record)
);

const replay = await call("POST", "/api/answers", {
    cookie,

    body: {
        gameId: "sim0",
        questionId: "S1P1",
        answer: wrongAnswer
    }
});

check(
    "A wrong retry scores 0 but keeps the best 10 AfriCOIN",
    replay.body.awarded === 0 &&
    replay.body.record.points === 10 &&
    replay.body.record.plays === 2 &&
    replay.body.user.points.games.sim0.points === 10,
    JSON.stringify(replay.body.record)
);

const supply = await call("POST", "/api/answers", {
    cookie,

    body: {
        gameId: "sim1",
        questionId: "L2P1",
        answer: questionFrom("sim1", "L2P1").answer
    }
});

check(
    "A correct Simulation 1 answer scores 20 AfriCOIN",
    supply.status === 200 &&
    supply.body.awarded === 20 &&
    supply.body.user.points.games.sim1.points === 20,
    JSON.stringify(supply.body.record)
);

const boardroom = await call("POST", "/api/answers", {
    cookie,

    body: {
        gameId: "sim2",
        questionId: "L3P1",
        answer: questionFrom("sim2", "L3P1").answer
    }
});

check(
    "A correct Simulation 2 advanced answer scores 30 AfriCOIN",
    boardroom.status === 200 &&
    boardroom.body.awarded === 30 &&
    boardroom.body.user.points.games.sim2.points === 30,
    JSON.stringify(boardroom.body.record)
);

const stillBest = await call("GET", "/api/me", { cookie });

check(
    "The account keeps the best AfriCOIN per problem (10 + 20 + 30)",
    stillBest.body.user.points.total === 60 &&
    stillBest.body.user.points.games.sim0.points === 10 &&
    stillBest.body.user.points.games.sim1.points === 20 &&
    stillBest.body.user.points.games.sim2.points === 30,
    JSON.stringify(stillBest.body.user.points.games)
);

const unknownQuestion = await call("POST", "/api/answers", {
    cookie,

    body: {
        gameId: "sim0",
        questionId: "999",
        answer: "A"
    }
});

check(
    "An unknown problem is rejected",
    unknownQuestion.status === 400
);

/* -------------------------------- admin -------------------------------- */

console.log("\nAdmin");

const badAdmin = await call("POST", "/api/admin/login", {
    body: {
        username: "admin",
        password: "not-the-password"
    }
});

check(
    "A wrong admin password is refused",
    badAdmin.status === 401
);

const adminLogin = await call("POST", "/api/admin/login", {
    body: {
        username: "admin",
        password: "EDT900@2026",
        remember: true
    }
});

const adminCookie = adminLogin.cookie;

check(
    "The admin can sign in with the default credentials",
    adminLogin.status === 200 &&
    adminLogin.body.ok === true &&
    adminCookie.startsWith("edt900_admin_sid=")
);

const blocked = await call("GET", "/api/admin/users");

check(
    "The user list is protected",
    blocked.status === 401
);

const users = await call("GET", "/api/admin/users", {
    cookie: adminCookie
});

check(
    "The admin sees every registered student with their AfriCOIN",
    users.status === 200 &&
    users.body.users.length === 1 &&
    users.body.users[0].email === "Thandi@Richfield.ac.za" &&
    users.body.users[0].points.total === 60 &&
    users.body.summary.users === 1,
    JSON.stringify(users.body.summary)
);

const detail = await call(
    "GET",
    "/api/admin/users/u1",
    { cookie: adminCookie }
);

check(
    "The admin can open one student and see every problem",
    detail.status === 200 &&
    detail.body.questions.length === 3 &&
    detail.body.questions[0].maximum === 10,
    JSON.stringify(
        detail.body.questions.map(row => ({
            game: row.gameId,
            question: row.questionId,
            points: row.points
        }))
    )
);

const summaryCsv = await call(
    "GET",
    "/api/admin/users.csv",
    { cookie: adminCookie }
);

check(
    "The summary CSV export has a header and one row per student",
    summaryCsv.status === 200 &&
    /^Name,Email/m.test(
        String(summaryCsv.body).replace(/^\uFEFF/, "")
    ) &&
    String(summaryCsv.body).includes("Thandi Mwale")
);

const questionsCsv = await call(
    "GET",
    "/api/admin/users.csv?view=questions",
    { cookie: adminCookie }
);

check(
    "The per-problem CSV export lists the answered problems",
    questionsCsv.status === 200 &&
    /Points earned/.test(String(questionsCsv.body)) &&
    String(questionsCsv.body).includes("Simulation 1")
);

const adminLogout = await call("POST", "/api/admin/logout", {
    cookie: adminCookie
});

check(
    "The admin can sign out",
    adminLogout.status === 200 &&
    adminLogout.body.ok === true
);

const signedOut = await call("GET", "/api/admin/users", {
    cookie: adminLogout.cookie
});

check(
    "The admin session is gone after signing out",
    signedOut.status === 401
);

const userLogout = await call("POST", "/api/logout", {
    cookie
});

const afterLogout = await call("GET", "/api/me", {
    cookie: userLogout.cookie
});

check(
    "A signed-out student can no longer read their account",
    afterLogout.status === 401
);

/* ------------------------------- summary ------------------------------- */

console.log(
    "\n-------------------------------------\n" +
    "Passed: " + passed + "\n" +
    "Failed: " + failed + "\n"
);

process.exit(failed ? 1 : 0);
