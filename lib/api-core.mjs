/**
 * Richfield EDT900 Game Simulations
 * ---------------------------------------------------------------
 * Framework-free API used by three thin adapters:
 *
 *   server.mjs                  local Node server, data/*.json files
 *   netlify/functions/api.mjs   Netlify function, Netlify Blobs
 *   api/[...route].mjs          Vercel function, Upstash / Vercel KV
 *
 * All expose the same JSON contract under /api, so the browser
 * code does not need to know where it is running.
 *
 * Routes
 *   POST /api/register          create an account + session
 *   POST /api/login             sign in
 *   POST /api/logout            sign out
 *   GET  /api/me                current account and AfriCOIN
 *   GET  /api/health            service check
 *   POST /api/answers           score one simulation problem
 *   POST /api/admin/login       admin sign in
 *   POST /api/admin/logout      admin sign out
 *   GET  /api/admin/me          current admin
 *   POST /api/admin/password    change the admin password
 *   GET  /api/admin/users       every registered player
 *   GET  /api/admin/users/:id   one player with per-problem detail
 *   GET  /api/admin/users.csv   CSV export (summary or questions)
 */

import fs from "node:fs";
import path from "node:path";

import {
    randomBytes,
    scryptSync,
    timingSafeEqual
} from "node:crypto";

import {
    GAME_IDS,
    SIM_ONE_ID,
    SIM_TWO_ID,
    SIM_ZERO_ID,
    scoreSubmission
} from "./game-catalog.mjs";

export const USER_COOKIE = "edt900_sid";
export const ADMIN_COOKIE = "edt900_admin_sid";

const SESSION_HOURS = 12;
const REMEMBER_DAYS = 30;
const SEEN_REFRESH_MS = 60 * 1000;
const THROTTLE_LIMIT = 8;
const THROTTLE_MS = 10 * 60 * 1000;
const MIN_PASSWORD = 8;

function nowIso() {
    return new Date().toISOString();
}

function hashPassword(password, salt) {
    return scryptSync(
        String(password),
        String(salt),
        64
    ).toString("hex");
}

function createSalt() {
    return randomBytes(16).toString("hex");
}

function matchesHash(password, salt, hash) {
    const candidate = Buffer.from(
        hashPassword(password, salt),
        "hex"
    );

    const expected = Buffer.from(
        String(hash || ""),
        "hex"
    );

    if (
        candidate.length !== expected.length ||
        !expected.length
    ) {
        return false;
    }

    return timingSafeEqual(candidate, expected);
}

function createToken() {
    return randomBytes(32).toString("hex");
}

function cleanText(value, maximum) {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maximum);
}

function emailKey(value) {
    return cleanText(value, 160).toLowerCase();
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value);
}

function passwordProblem(password) {
    if (String(password ?? "").length < MIN_PASSWORD) {
        return (
            "Use at least " +
            MIN_PASSWORD +
            " characters for the password."
        );
    }

    if (!/[a-z]/i.test(password)) {
        return "The password needs at least one letter.";
    }

    if (!/[0-9]/.test(password)) {
        return "The password needs at least one number.";
    }

    return "";
}

function parseCookies(header) {
    const cookies = {};

    String(header || "")
        .split(";")
        .forEach(part => {
            const index = part.indexOf("=");

            if (index < 1) {
                return;
            }

            const name = part.slice(0, index).trim();

            cookies[name] =
                decodeURIComponent(
                    part.slice(index + 1).trim()
                );
        });

    return cookies;
}

function cookieHeader(name, value, options = {}) {
    const parts = [
        name + "=" + value,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax"
    ];

    if (options.secure) {
        parts.push("Secure");
    }

    if (options.maxAge) {
        parts.push("Max-Age=" + options.maxAge);
    }

    return parts.join("; ");
}

function json(status, payload, headers = {}) {
    return {
        status,
        headers,
        json: payload
    };
}

function text(status, body, headers = {}) {
    return {
        status,
        headers,
        text: body
    };
}

function normalisePath(path) {
    const value =
        String(path || "/")
            .split("?")[0];

    return value.length > 1
        ? value.replace(/\/+$/, "")
        : value;
}

function emptyGame() {
    return {
        questions: {},
        attempts: 0,
        firstAt: null,
        lastAt: null
    };
}

function normaliseUser(user) {
    const value = user && typeof user === "object"
        ? user
        : {};

    value.games = value.games || {};

    GAME_IDS.forEach(gameId => {
        const game = value.games[gameId];

        value.games[gameId] = game && typeof game === "object"
            ? {
                questions: game.questions || {},
                attempts: Number(game.attempts || 0),
                firstAt: game.firstAt || null,
                lastAt: game.lastAt || null
            }
            : emptyGame();
    });

    return value;
}

function summariseUser(user, catalog) {
    const summary = {
        total: 0,
        maximum: catalog.maximumTotal,
        answered: 0,
        correct: 0,
        questions: 0,
        games: {}
    };

    GAME_IDS.forEach(gameId => {
        const maximum =
            catalog.games[gameId]?.maximum || 0;

        const questionCount =
            catalog.games[gameId]?.questionCount || 0;

        const game = user.games[gameId] || emptyGame();

        let points = 0;
        let answered = 0;
        let correct = 0;

        Object.keys(game.questions).forEach(key => {
            const record = game.questions[key] || {};

            if (record.bonus) {
                return;
            }

            points += Number(record.best || 0);
            answered += 1;

            if (record.correctEver) {
                correct += 1;
            }
        });

        summary.games[gameId] = {
            id: gameId,
            label: catalog.games[gameId]?.label || gameId,
            title: catalog.games[gameId]?.title || "",
            points,
            maximum,
            answered,
            correct,
            questionCount,
            attempts: Number(game.attempts || 0),
            lastAt: game.lastAt || null,
            firstAt: game.firstAt || null
        };

        summary.total += points;
        summary.answered += answered;
        summary.correct += correct;
        summary.questions += questionCount;
    });

    return summary;
}

function publicUser(user, catalog) {
    const summary = summariseUser(user, catalog);

    return {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        createdAt: user.createdAt || null,
        lastLoginAt: user.lastLoginAt || null,
        lastSeenAt: user.lastSeenAt || null,
        points: summary
    };
}

function adminUserRow(user, catalog) {
    const summary = summariseUser(user, catalog);

    return {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        createdAt: user.createdAt || null,
        lastLoginAt: user.lastLoginAt || null,
        lastSeenAt: user.lastSeenAt || null,
        points: summary
    };
}

function recordSubmission(user, catalog, gameId, result) {
    const stamp = nowIso();

    const game =
        user.games[gameId] ||
        (user.games[gameId] = emptyGame());

    const existing =
        game.questions[result.questionId] || {
            firstAt: stamp,
            plays: 0,
            best: 0,
            correctEver: false
        };

    const isBonus =
        result.kind === "bonus";

    const record = {
        id: result.questionId,
        kind: result.kind,
        bonus: isBonus,
        label: result.label,

        maximum: result.maximum,
        best: Math.max(
            Number(existing.best || 0),
            result.points
        ),

        lastPoints: result.points,
        correct: result.correct,

        correctEver:
            Boolean(existing.correctEver) ||
            result.correct,

        answer: result.answer,
        plays: Number(existing.plays || 0) + 1,
        firstAt: existing.firstAt || stamp,
        lastAt: stamp
    };

    if (result.breakdown) {
        record.breakdown = result.breakdown;
    }

    game.questions[result.questionId] = record;
    game.attempts = Number(game.attempts || 0) + 1;
    game.lastAt = stamp;
    game.firstAt = game.firstAt || stamp;

    user.games[gameId] = game;

    return record;
}

function questionRows(user, catalog) {
    const rows = [];

    GAME_IDS.forEach(gameId => {
        const game = user.games[gameId] || emptyGame();

        Object.keys(game.questions)
            .sort((left, right) => {
                const a = Number(left);
                const b = Number(right);

                if (
                    Number.isFinite(a) &&
                    Number.isFinite(b)
                ) {
                    return a - b;
                }

                return String(left)
                    .localeCompare(String(right));
                })
            .forEach(key => {
                const record = game.questions[key] || {};

                rows.push({
                    gameId,
                    gameLabel:
                        catalog.games[gameId]?.label ||
                        gameId,

                    questionId: key,
                    label: record.label || key,
                    bonus: Boolean(record.bonus),

                    points: Number(record.best || 0),
                    maximum: Number(record.maximum || 0),
                    lastPoints: Number(record.lastPoints || 0),

                    correct: Boolean(record.correct),
                    correctEver: Boolean(record.correctEver),
                    plays: Number(record.plays || 0),
                    lastAt: record.lastAt || null
                });
            });
    });

    return rows;
}

/* ---------------------------- published files ------------------------- */

/*
 * Vercel can hand the pages and assets to this function instead of serving
 * them from the static step (that happens when the project keeps its own
 * output directory in the dashboard). vercel.json lists the same files in
 * `functions[...].includeFiles`, so they travel inside the function and are
 * read back from disk here.
 */

const PUBLISHED_PAGES = new Set([
    "index",
    "game",
    "login",
    "register",
    "admin"
]);

const PUBLISHED_TYPES = new Map([
    [".html", "text/html; charset=utf-8"],
    [".css", "text/css; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".svg", "image/svg+xml"],
    [".txt", "text/plain; charset=utf-8"]
]);

const PUBLISHED_PROBE = [
    "index.html",
    "game.html",
    "login.html",
    "register.html",
    "admin.html",
    "assets/css/style.css",
    "assets/css/theme.css",
    "assets/js/quiz-games.js",
    "assets/js/api-client.js",
    "assets/js/local-db.js",
    "assets/js/admin.js",
    "assets/data/EDT900_Simulation_0_AI_Detective.json",
    "lib/published-bundle.mjs",
    "vercel.json"
];

function publishedTarget(pathname) {
    if (pathname.startsWith("/api/pages/")) {
        const page = pathname.slice("/api/pages/".length);

        return page.endsWith(".html")
            ? page
            : page + ".html";
    }

    if (pathname.startsWith("/api/assets/")) {
        return "assets/" + pathname.slice("/api/assets/".length);
    }

    if (pathname.startsWith("/assets/")) {
        return pathname.slice(1);
    }

    const page = pathname
        .replace(/^\/+/, "")
        .replace(/\.html$/, "");

    if (!page) {
        return "index.html";
    }

    return PUBLISHED_PAGES.has(page)
        ? page + ".html"
        : "";
}

/** Sends one published page or asset, or null when it is not ours. */
async function publishedFile(context, settings) {
    if (
        !settings.publishedRoot &&
        !settings.publishedFiles
    ) {
        return null;
    }

    if (
        context.method !== "GET" &&
        context.method !== "HEAD"
    ) {
        return null;
    }

    const relative = publishedTarget(context.path);

    if (!relative) {
        return null;
    }

    const parts = relative.split("/").filter(Boolean);

    const safe = parts.length > 0 && parts.every(
        part =>
            part !== "." &&
            part !== ".." &&
            !part.startsWith(".")
    );

    if (!safe) {
        return null;
    }

    const type = PUBLISHED_TYPES.get(
        path.extname(parts[parts.length - 1]).toLowerCase()
    );

    if (!type) {
        return null;
    }

    const name = parts.join("/");

    let body = await publishedBody(name, settings);

    if (body === null) {
        // The copy that travels inside the function.
        body =
            settings.publishedFiles &&
            Object.prototype.hasOwnProperty.call(
                settings.publishedFiles,
                name
            )
                ? settings.publishedFiles[name]
                : null;
    }

    if (body === null) {
        return null;
    }

    return text(
        200,
        context.method === "HEAD" ? "" : body,
        {
            "content-type": type,

            "cache-control": type.startsWith("text/html")
                ? "no-cache"
                : "public, max-age=3600"
        }
    );
}

/** Reads one published file from disk, or null when it is not there. */
async function publishedBody(name, settings) {
    if (!settings.publishedRoot) {
        return null;
    }

    try {
        return await fs.promises.readFile(
            path.join(settings.publishedRoot, name),
            "utf8"
        );
    } catch (error) {
        return null;
    }
}

/** Lists a few published files so /api/health?debug=1 can show them. */
function publishedReport(settings) {
    const files = {};

    PUBLISHED_PROBE.forEach(name => {
        try {
            files[name] = Boolean(
                settings.publishedRoot &&
                fs.existsSync(
                    path.join(settings.publishedRoot, name)
                )
            );
        } catch (error) {
            files[name] = false;
        }
    });

    return {
        root: settings.publishedRoot || "",
        bundle: settings.publishedFiles
            ? Object.keys(settings.publishedFiles).length
            : 0,
        sample: settings.publishedFiles
            ? Object.keys(settings.publishedFiles).sort().slice(0, 3)
            : [],
        files
    };
}

/** Creates the API handler for one storage backend. */
export function createApi({ catalog, kv, config = {} }) {
    const settings = {
        adminUsername:
            cleanText(config.adminUsername || "admin", 40) ||
            "admin",

        adminPassword:
            String(config.adminPassword || "EDT900@2026"),

        siteName:
            String(
                config.siteName ||
                "Richfield EDT900 Game Simulations"
            ),

        // Extra admin logins copied into data/admins.json on the first run.
        adminLogins:
            Array.isArray(config.adminLogins)
                ? config.adminLogins
                : [],

        // Vercel only: folder holding the pages and assets that
        // vercel.json bundles into this function (includeFiles).
        publishedRoot: config.publishedRoot
            ? path.resolve(String(config.publishedRoot))
            : "",

        // Vercel only: the committed copy of the same files, used when
        // the deployment does not carry them on disk.
        publishedFiles:
            config.publishedFiles &&
            typeof config.publishedFiles === "object"
                ? config.publishedFiles
                : null
    };

    function sessionKey(kind, token) {
        return (
            (kind === "admin"
                ? "adminSession:"
                : "session:") + token
        );
    }

    async function readIndex() {
        const index = await kv.get("userIndex");

        if (index && Array.isArray(index.ids)) {
            return {
                ids: index.ids,
                next: Number(index.next || index.ids.length + 1)
            };
        }

        return { ids: [], next: 1 };
    }

    async function writeIndex(index) {
        await kv.set("userIndex", index);
    }

    async function loadUser(id) {
        const stored = await kv.get("user:" + id);

        return stored
            ? normaliseUser(stored)
            : null;
    }

    async function saveUser(user) {
        await kv.set("user:" + user.id, user);
    }

    async function listUsers() {
        const index = await readIndex();
        const users = [];

        for (const id of index.ids) {
            const user = await loadUser(id);

            if (user) {
                users.push(user);
            }
        }

        return users;
    }

    async function findUserByEmail(key) {
        const index = await readIndex();

        for (const id of index.ids) {
            const user = await loadUser(id);

            if (user && user.emailKey === key) {
                return user;
            }
        }

        return null;
    }

    async function startSession(kind, userId, remember) {
        const token = createToken();

        const lifetime = remember
            ? REMEMBER_DAYS * 24 * 60 * 60 * 1000
            : SESSION_HOURS * 60 * 60 * 1000;

        const session = {
            token,
            kind,
            userId: userId || null,
            createdAt: nowIso(),

            expiresAt:
                new Date(
                    Date.now() + lifetime
                ).toISOString()
        };

        await kv.set(
            sessionKey(kind, token),
            session
        );

        return {
            token,
            session,

            maxAge:
                remember
                    ? Math.floor(lifetime / 1000)
                    : 0
        };
    }

    async function readSession(kind, token) {
        if (!token) {
            return null;
        }

        const session = await kv.get(
            sessionKey(kind, token)
        );

        if (!session) {
            return null;
        }

        if (
            Date.parse(session.expiresAt || 0) <
            Date.now()
        ) {
            await kv.remove(
                sessionKey(kind, token)
            );

            return null;
        }

        return session;
    }

    async function endSession(kind, token) {
        if (token) {
            await kv.remove(
                sessionKey(kind, token)
            );
        }
    }

    async function currentUser(cookies) {
        const session = await readSession(
            "user",
            cookies[USER_COOKIE]
        );

        if (!session || !session.userId) {
            return null;
        }

        const user = await loadUser(session.userId);

        return user && !user.disabled
            ? user
            : null;
    }

    async function currentAdmin(cookies) {
        return readSession(
            "admin",
            cookies[ADMIN_COOKIE]
        );
    }

    function adminIdentifier(admin) {
        return String(
            admin.username ||
            admin.email ||
            ""
        ).toLowerCase();
    }

    function publicAdmin(admin) {
        return {
            username: admin.username || "",
            name: admin.name || admin.username || "Administrator",
            email: admin.email || null,
            role: admin.role || "admin"
        };
    }

    /** Reads data/admins.json, seeding it on the first run. */
    async function loadAdmins() {
        const stored = await kv.get("admins");

        if (Array.isArray(stored) && stored.length) {
            return stored;
        }

        const seeds = [
            {
                username: settings.adminUsername,
                password: settings.adminPassword,
                name: "Richfield EDT900 Administrator",
                role: "owner"
            }
        ];

        settings.adminLogins.forEach(login => {
            const username = cleanText(
                login.username || login.email,
                120
            );

            if (!username) {
                return;
            }

            if (
                seeds.some(
                    seed =>
                        adminIdentifier(seed) ===
                        username.toLowerCase()
                )
            ) {
                return;
            }

            seeds.push({
                username,

                email: login.email
                    ? cleanText(login.email, 160)
                    : null,

                password: String(login.password || ""),

                name:
                    cleanText(login.name, 80) ||
                    username,

                role: login.role || "admin"
            });
        });

        await kv.set("admins", seeds);

        return seeds;
    }

    async function saveAdmins(admins) {
        await kv.set("admins", admins);
    }

    function findAdmin(admins, identifier) {
        const key = cleanText(identifier, 160)
            .toLowerCase();

        return (
            admins.find(admin => {
                return (
                    adminIdentifier(admin) === key ||
                    String(admin.email || "")
                        .toLowerCase() === key
                );
            }) || null
        );
    }

    function adminPasswordMatches(admin, password) {
        // Seeded logins are stored in a readable form so the admin can
        // see them in data/admins.json; once the password is changed
        // from the score monitor only the hash remains.
        if (admin.password) {
            return String(admin.password) ===
                String(password);
        }

        if (admin.salt && admin.passwordHash) {
            return matchesHash(
                password,
                admin.salt,
                admin.passwordHash
            );
        }

        return false;
    }

    async function currentAdminAccount(cookies) {
        const session = await currentAdmin(cookies);

        if (!session || !session.userId) {
            return null;
        }

        const admins = await loadAdmins();

        return findAdmin(admins, session.userId);
    }

    async function throttleState(key) {
        const record =
            await kv.get("throttle:" + key);

        if (!record) {
            return null;
        }

        const until = Date.parse(record.until || 0);

        return (
            Number.isFinite(until) &&
            until > Date.now()
        )
            ? record
            : null;
    }

    async function noteFailure(key) {
        const record =
            (await kv.get("throttle:" + key)) ||
            { count: 0, until: null };

        const count =
            Number(record.count || 0) + 1;

        await kv.set("throttle:" + key, {
            count,
            lastAt: nowIso(),

            until:
                count >= THROTTLE_LIMIT
                    ? new Date(
                        Date.now() + THROTTLE_MS
                    ).toISOString()
                    : record.until
        });
    }

    async function clearFailures(key) {
        await kv.remove("throttle:" + key);
    }

    async function touchUser(user) {
        const stamp = nowIso();
        const seen = Date.parse(user.lastSeenAt || 0);

        if (
            !Number.isFinite(seen) ||
            Date.now() - seen > SEEN_REFRESH_MS
        ) {
            user.lastSeenAt = stamp;
            await saveUser(user);
        }

        return user;
    }

    /* --------------------------- account routes --------------------------- */

    async function handleRegister(context) {
        const body = context.body || {};

        const fullName = cleanText(body.fullName, 80);
        const email = cleanText(body.email, 160);
        const key = emailKey(email);
        const password = String(body.password ?? "");

        const confirm = String(
            body.confirmPassword ?? password
        );

        if (fullName.length < 2) {
            return json(400, {
                ok: false,
                message: "Please enter your full name."
            });
        }

        if (!isValidEmail(email)) {
            return json(400, {
                ok: false,
                message: "Please enter a valid email address."
            });
        }

        const problem = passwordProblem(password);

        if (problem) {
            return json(400, {
                ok: false,
                message: problem
            });
        }

        if (password !== confirm) {
            return json(400, {
                ok: false,
                message: "The two passwords do not match."
            });
        }

        if (await findUserByEmail(key)) {
            return json(409, {
                ok: false,

                message:
                    "That email address is already registered. " +
                    "Please sign in instead."
            });
        }

        const index = await readIndex();
        const salt = createSalt();
        const stamp = nowIso();

        const user = normaliseUser({
            id: "u" + index.next,
            fullName,
            email,
            emailKey: key,
            salt,

            passwordHash:
                hashPassword(password, salt),

            createdAt: stamp,
            lastLoginAt: stamp,
            lastSeenAt: stamp,
            disabled: false
        });

        await saveUser(user);

        index.ids.push(user.id);
        index.next += 1;

        await writeIndex(index);

        const session = await startSession(
            "user",
            user.id,
            Boolean(body.remember)
        );

        return json(
            201,
            {
                ok: true,
                user: publicUser(user, catalog)
            },
            {
                "set-cookie": cookieHeader(
                    USER_COOKIE,
                    session.token,
                    {
                        secure: context.secure,
                        maxAge: session.maxAge
                    }
                )
            }
        );
    }

    async function handleLogin(context) {
        const body = context.body || {};

        const key = emailKey(body.email);
        const password = String(body.password ?? "");

        if (!key || !password) {
            return json(400, {
                ok: false,

                message:
                    "Please enter your email address and password."
            });
        }

        if (await throttleState(key)) {
            return json(429, {
                ok: false,

                message:
                    "Too many failed attempts. " +
                    "Please try again in a few minutes."
            });
        }

        const user = await findUserByEmail(key);

        if (
            !user ||
            !matchesHash(
                password,
                user.salt,
                user.passwordHash
            )
        ) {
            await noteFailure(key);

            return json(401, {
                ok: false,

                message:
                    "Those details do not match an account. " +
                    "Check your email address and password."
            });
        }

        await clearFailures(key);

        user.lastLoginAt = nowIso();
        user.lastSeenAt = user.lastLoginAt;

        await saveUser(user);

        const session = await startSession(
            "user",
            user.id,
            Boolean(body.remember)
        );

        return json(
            200,
            {
                ok: true,
                user: publicUser(user, catalog)
            },
            {
                "set-cookie": cookieHeader(
                    USER_COOKIE,
                    session.token,
                    {
                        secure: context.secure,
                        maxAge: session.maxAge
                    }
                )
            }
        );
    }


    async function handleLogout(context) {
        await endSession(
            "user",
            context.cookies[USER_COOKIE]
        );

        return json(
            200,
            { ok: true },
            {
                "set-cookie": cookieHeader(
                    USER_COOKIE,
                    "",
                    {
                        secure: context.secure,
                        maxAge: 1
                    }
                )
            }
        );
    }

    async function handleMe(context) {
        const user = await currentUser(
            context.cookies
        );

        if (!user) {
            return json(401, {
                ok: false,
                message: "Not signed in.",
                user: null
            });
        }

        await touchUser(user);

        return json(200, {
            ok: true,
            user: publicUser(user, catalog)
        });
    }

    async function handleHealth(context) {
        const payload = {
            ok: true,
            service: settings.siteName,

            games: GAME_IDS.map(gameId => ({
                id: gameId,

                label:
                    catalog.games[gameId].label,

                title:
                    catalog.games[gameId].title,

                questions:
                    catalog.games[gameId].questionCount,

                maximum:
                    catalog.games[gameId].maximum
            })),

            maximumTotal: catalog.maximumTotal,
            commit: String(process.env.VERCEL_GIT_COMMIT_SHA || ""),
            time: nowIso()
        };

        // The pages and assets this function can serve itself. The report
        // is small (file names and counts) and tells hosting problems
        // apart: see README, "Deploying to Vercel".
        payload.published = publishedReport(settings);

        return json(200, payload);
    }

    async function handleAnswers(context) {
        const user = await currentUser(
            context.cookies
        );

        if (!user) {
            return json(401, {
                ok: false,

                message:
                    "Please sign in again so your points can be saved."
            });
        }

        const result = scoreSubmission(
            catalog,
            context.body || {}
        );

        if (!result) {
            return json(400, {
                ok: false,

                message:
                    "That question could not be found in the game data."
            });
        }

        const gameId = result.gameId;

        const record = recordSubmission(
            user,
            catalog,
            gameId,
            result
        );

        user.lastSeenAt = nowIso();

        await saveUser(user);

        return json(200, {
            ok: true,
            awarded: result.points,
            correct: result.correct,
            maximum: result.maximum,
            gameId,
            questionId: result.questionId,

            breakdown:
                result.breakdown || null,

            record: {
                points: record.best,
                lastPoints: record.lastPoints,
                plays: record.plays,
                correct: record.correct,
                correctEver: record.correctEver
            },

            user: publicUser(user, catalog)
        });
    }


    /* ---------------------------- admin routes ---------------------------- */

    async function requireAdmin(context) {
        const session = await currentAdmin(
            context.cookies
        );

        if (!session) {
            return null;
        }

        return session;
    }

    async function handleAdminLogin(context) {
        const body = context.body || {};

        const identifier = cleanText(
            body.username || body.email,
            160
        );

        const password = String(body.password ?? "");

        const key = identifier.toLowerCase();

        if (!key || !password) {
            return json(400, {
                ok: false,

                message:
                    "Enter your admin username (or email) and password."
            });
        }

        if (await throttleState("admin:" + key)) {
            return json(429, {
                ok: false,

                message:
                    "Too many failed attempts. " +
                    "Please try again in a few minutes."
            });
        }

        const admins = await loadAdmins();
        const admin = findAdmin(admins, identifier);

        if (!admin || !adminPasswordMatches(admin, password)) {
            await noteFailure("admin:" + key);

            return json(401, {
                ok: false,

                message:
                    "Those admin details are not correct."
            });
        }

        await clearFailures("admin:" + key);

        const session = await startSession(
            "admin",
            adminIdentifier(admin),
            Boolean(body.remember)
        );

        return json(
            200,
            {
                ok: true,
                admin: publicAdmin(admin),

                sessionStartedAt:
                    session.session.createdAt
            },
            {
                "set-cookie": cookieHeader(
                    ADMIN_COOKIE,
                    session.token,
                    {
                        secure: context.secure,
                        maxAge: session.maxAge
                    }
                )
            }
        );
    }

    async function handleAdminLogout(context) {
        await endSession(
            "admin",
            context.cookies[ADMIN_COOKIE]
        );

        return json(
            200,
            { ok: true },
            {
                "set-cookie": cookieHeader(
                    ADMIN_COOKIE,
                    "",
                    {
                        secure: context.secure,
                        maxAge: 1
                    }
                )
            }
        );
    }

    async function handleAdminMe(context) {
        const admin = await currentAdminAccount(
            context.cookies
        );

        if (!admin) {
            return json(401, {
                ok: false,
                signedIn: false
            });
        }

        const admins = await loadAdmins();

        return json(200, {
            ok: true,
            signedIn: true,
            admin: publicAdmin(admin),

            adminLogins: admins.map(entry => ({
                username: entry.username,

                name:
                    entry.name ||
                    entry.username,

                role: entry.role || "admin",

                passwordProtected:
                    Boolean(
                        entry.passwordHash &&
                        !entry.password
                    )
            }))
        });
    }

    async function handleAdminPassword(context) {
        const admin = await currentAdminAccount(
            context.cookies
        );

        if (!admin) {
            return json(401, {
                ok: false,
                message: "Please sign in as admin first."
            });
        }

        const body = context.body || {};

        const current =
            String(body.currentPassword ?? "");

        const next =
            String(body.newPassword ?? "");

        if (!adminPasswordMatches(admin, current)) {
            return json(401, {
                ok: false,

                message:
                    "The current admin password is not correct."
            });
        }

        const problem = passwordProblem(next);

        if (problem) {
            return json(400, {
                ok: false,
                message: problem
            });
        }

        const admins = await loadAdmins();

        const index = admins.findIndex(
            entry =>
                adminIdentifier(entry) ===
                adminIdentifier(admin)
        );

        const salt = createSalt();

        const updated = {
            ...(index >= 0 ? admins[index] : admin),
            salt,

            passwordHash:
                hashPassword(next, salt),

            updatedAt: nowIso()
        };

        // Once the password is changed only the hash is kept, so the
        // readable password disappears from data/admins.json.
        delete updated.password;
        delete updated.fromEnvironment;

        if (index >= 0) {
            admins[index] = updated;
        } else {
            admins.push(updated);
        }

        await saveAdmins(admins);

        return json(200, {
            ok: true,

            message:
                "Password updated for " +
                (updated.username || "the admin") +
                "."
        });
    }

    /* ----------------------------- admin data ----------------------------- */

    function csvCell(value) {
        const cell = String(
            value === null || value === undefined
                ? ""
                : value
        );

        return /[",\r\n]/.test(cell)
            ? '"' + cell.replaceAll('"', '""') + '"'
            : cell;
    }

    function csvRow(values) {
        return values.map(csvCell).join(",");
    }

    async function handleAdminUsers(context) {
        if (!(await requireAdmin(context))) {
            return json(401, {
                ok: false,
                signedIn: false,

                message:
                    "Please sign in as admin to see the users."
            });
        }

        const rows = (await listUsers())
            .map(user => adminUserRow(user, catalog));

        rows.sort((left, right) => {
            const difference =
                right.points.total -
                left.points.total;

            return difference !== 0
                ? difference
                : left.fullName.localeCompare(
                    right.fullName
                );
        });

        const today = nowIso().slice(0, 10);

        const totalPoints = rows.reduce(
            (sum, row) => sum + row.points.total,
            0
        );

        return json(200, {
            ok: true,
            users: rows,

            summary: {
                users: rows.length,
                totalPoints,

                averagePoints: rows.length
                    ? Math.round(
                        totalPoints / rows.length
                    )
                    : 0,

                activeToday: rows.filter(
                    row =>
                        String(row.lastSeenAt || "")
                            .slice(0, 10) === today
                ).length,

                topScorer: rows.length
                    ? {
                        fullName: rows[0].fullName,
                        email: rows[0].email,
                        points: rows[0].points.total
                    }
                    : null,

                games: GAME_IDS.map(gameId => {
                    const average = rows.length
                        ? Math.round(
                            rows.reduce(
                                (sum, row) =>
                                    sum +
                                    row.points.games[gameId]
                                        .points,
                                0
                            ) / rows.length
                        )
                        : 0;

                    return {
                        id: gameId,
                        label: catalog.games[gameId].label,
                        title: catalog.games[gameId].title,

                        maximum:
                            catalog.games[gameId].maximum,

                        average
                    };
                }),

                maximumTotal: catalog.maximumTotal
            },

            generatedAt: nowIso()
        });
    }

    async function handleAdminUser(context) {
        if (!(await requireAdmin(context))) {
            return json(401, {
                ok: false,
                signedIn: false,

                message:
                    "Please sign in as admin to see the users."
            });
        }

        const id = String(context.params?.[0] || "")
            .trim();

        const user = await loadUser(id);

        if (!user) {
            return json(404, {
                ok: false,

                message:
                    "That user could not be found."
            });
        }

        return json(200, {
            ok: true,
            user: adminUserRow(user, catalog),
            questions: questionRows(user, catalog),
            generatedAt: nowIso()
        });
    }

    async function handleAdminCsv(context) {
        if (!(await requireAdmin(context))) {
            return text(401, "Please sign in as admin.", {
                "content-type":
                    "text/plain; charset=utf-8"
            });
        }

        const view = String(
            context.query?.view || "summary"
        ).toLowerCase();

        const lines = [];
        const users = await listUsers();

        if (view === "questions") {
            lines.push(csvRow([
                "User",
                "Email",
                "Game",
                "Question",
                "Question label",
                "Points earned",
                "Points possible",
                "Answered correctly",
                "Attempts",
                "Last attempt"
            ]));

            users.forEach(user => {
                questionRows(user, catalog)
                    .forEach(row => {
                        lines.push(csvRow([
                            user.fullName,
                            user.email,
                            row.gameLabel,
                            row.questionId,
                            row.label,
                            row.points,
                            row.maximum,

                            row.correctEver
                                ? "yes"
                                : "no",

                            row.plays,
                            row.lastAt || ""
                        ]));
                    });
            });
        } else {
            lines.push(csvRow([
                "Name",
                "Email",
                "Registered",
                "Last sign in",
                "Last seen",

                ...GAME_IDS.flatMap(gameId => [
                    catalog.games[gameId].label + " AfriCOIN",
                    catalog.games[gameId].label + " maximum",
                    catalog.games[gameId].label + " answered",
                    catalog.games[gameId].label + " correct"
                ]),

                "Total AfriCOIN",
                "Total maximum"
            ]));

            users.forEach(user => {
                const row =
                    adminUserRow(user, catalog);

                lines.push(csvRow([
                    row.fullName,
                    row.email,
                    row.createdAt || "",
                    row.lastLoginAt || "",
                    row.lastSeenAt || "",

                    ...GAME_IDS.flatMap(gameId => {
                        const game =
                            row.points.games[gameId];

                        return [
                            game.points,
                            game.maximum,
                            game.answered,
                            game.correct
                        ];
                    }),

                    row.points.total,
                    row.points.maximum
                ]));
            });
        }

        const stamp = nowIso()
            .slice(0, 19)
            .replace(/[:T]/g, "-");

        return text(
            200,
            "\uFEFF" + lines.join("\r\n") + "\r\n",
            {
                "content-type":
                    "text/csv; charset=utf-8",

                "content-disposition":
                    'attachment; filename="' +
                    "edt900-game-simulations-" +
                    view +
                    "-" +
                    stamp +
                    '.csv"',

                "cache-control": "no-store"
            }
        );
    }

    /* --------------------------- simulation locks -------------------------- */

    async function loadLocks() {
        const stored = await kv.get("locks");
        const locks = {};

        GAME_IDS.forEach(gameId => {
            locks[gameId] = Boolean(stored && stored[gameId]);
        });

        return locks;
    }

    /** GET /api/locks - which simulations the facilitator has locked. */
    async function handleLocks() {
        return json(200, {
            ok: true,
            locks: await loadLocks(),

            cache-control: "no-store"
        });
    }

    /** POST /api/admin/locks - lock or unlock one simulation. */
    async function handleAdminLocks(context) {
        const admin = await currentAdminAccount(context.cookies);

        if (!admin) {
            return json(401, {
                ok: false,

                message:
                    "Please sign in as admin to lock or " +
                    "unlock a simulation."
            });
        }

        const body = context.body || {};
        const gameId = String(body.gameId || "");
        const locked = Boolean(body.locked);

        if (!GAME_IDS.includes(gameId)) {
            return json(400, {
                ok: false,
                message: "Unknown simulation."
            });
        }

        const locks = await loadLocks();

        locks[gameId] = locked;

        await kv.set("locks", locks);

        return json(200, {
            ok: true,
            locks,
            message:
                (catalog.games[gameId]?.label || gameId) +
                (locked ? " is locked." : " is open.")
        });
    }

    /* ------------------------------- routing ------------------------------ */

    const routes = [
        ["GET", /^\/api\/health$/, handleHealth],
        ["GET", /^\/api\/locks$/, handleLocks],

        ["POST", /^\/api\/register$/, handleRegister],
        ["POST", /^\/api\/login$/, handleLogin],
        ["POST", /^\/api\/logout$/, handleLogout],
        ["GET", /^\/api\/me$/, handleMe],
        ["POST", /^\/api\/answers$/, handleAnswers],

        ["POST", /^\/api\/admin\/login$/, handleAdminLogin],
        ["POST", /^\/api\/admin\/logout$/, handleAdminLogout],
        ["GET", /^\/api\/admin\/me$/, handleAdminMe],

        [
            "POST",
            /^\/api\/admin\/password$/,
            handleAdminPassword
        ],

        ["GET", /^\/api\/admin\/users$/, handleAdminUsers],

        [
            "POST",
            /^\/api\/admin\/locks$/,
            handleAdminLocks
        ],

        [
            "GET",
            /^\/api\/admin\/users\.csv$/,
            handleAdminCsv
        ],

        [
            "GET",
            /^\/api\/admin\/users\/([^/]+)$/,
            handleAdminUser
        ]
    ];

    async function handle(request) {
        const context = {
            method: String(request.method || "GET")
                .toUpperCase(),

            path: normalisePath(request.path),
            query: request.query || {},
            body: request.body || null,
            cookie: String(request.cookie || ""),
            secure: Boolean(request.secure)
        };

        context.cookies = parseCookies(
            context.cookie
        );

        try {
            for (const entry of routes) {
                const [method, pattern, route] = entry;

                if (method !== context.method) {
                    continue;
                }

                const match = pattern.exec(
                    context.path
                );

                if (!match) {
                    continue;
                }

                context.params = match.slice(1);

                return await route(context);
            }

            const published = await publishedFile(
                context,
                settings
            );

            if (published) {
                return published;
            }

            return json(404, {
                ok: false,

                message:
                    "Unknown API route: " +
                    context.path
            });
        } catch (error) {
            return json(500, {
                ok: false,

                message:
                    "Server error: " +
                    (
                        error?.message ||
                        String(error)
                    )
            });
        }
    }

    return {
        handle,
        settings,
        catalog,
        listUsers
    };
}

