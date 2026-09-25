/**
 * Richfield EDT900 Game Simulations
 * ---------------------------------------------------------------
 * Local JSON database kept inside the browser (localStorage).
 *
 * This is the automatic fallback when the site is opened without the
 * game server (for example straight from a static host, or a Vercel
 * preview without the hosted key/value store). It speaks exactly the
 * same requests and answers as /api, so every page keeps working.
 *
 * The shared database is still the JSON files in data/
 * (data/users.json and data/admins.json) written by server.mjs - the
 * note on the pages tells the user which mode is active.
 *
 * Seeded admin logins are listed in SEED_ADMINS below:
 *   admin / EDT900@2026
 *   mbofhenijunior7@gmail.com / GRIT@2026
 */

(function () {
    "use strict";

    const USERS_KEY = "edt900_local_db_users";
    const ADMINS_KEY = "edt900_local_db_admins";
    const SESSION_KEY = "edt900_local_db_session";
    const ADMIN_KEY = "edt900_local_db_admin_session";

    const GAME_OPTIONS = [
        {
            id: "sim0",
            label: "Simulation 0",
            maximum: 300,
            questions: 15
        },
        {
            id: "sim1",
            label: "Simulation 1",
            maximum: 180,
            questions: 9
        },
        {
            id: "sim2",
            label: "Simulation 2",
            maximum: 180,
            questions: 9
        }
    ];

    const GAME_IDS = GAME_OPTIONS.map(game => game.id);

    const MAXIMUM = {
        sim0: 300,
        sim1: 180,
        sim2: 180,
        total: 660
    };

    const SEED_ADMINS = [
        {
            username: "admin",
            password: "EDT900@2026",
            name: "Richfield EDT900 Administrator",
            role: "owner"
        },
        {
            username: "mbofhenijunior7@gmail.com",
            email: "mbofhenijunior7@gmail.com",
            password: "GRIT@2026",
            name: "Makhavhu MJ",
            role: "owner"
        }
    ];

    /* ----------------------------- storage ----------------------------- */

    function read(key, fallback) {
        try {
            const raw = localStorage.getItem(key);

            return raw ? JSON.parse(raw) : fallback;
        } catch (error) {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            /* private browsing - carry on without persistence */
        }
    }

    function users() {
        const list = read(USERS_KEY, []);

        return Array.isArray(list) ? list : [];
    }

    function saveUsers(list) {
        write(USERS_KEY, list);
    }

    function admins() {
        const list = read(ADMINS_KEY, null);

        if (Array.isArray(list) && list.length) {
            return list;
        }

        write(ADMINS_KEY, SEED_ADMINS);

        return SEED_ADMINS.map(admin => ({ ...admin }));
    }

    function hash(text) {
        // Test-mode hash: quick, deterministic and never sent anywhere.
        let value = 2166136261;
        const source = String(text);

        for (let index = 0; index < source.length; index += 1) {
            value ^= source.charCodeAt(index);
            value = Math.imul(value, 16777619);
        }

        return (value >>> 0).toString(16);
    }

    function salt() {
        return (
            Math.random().toString(36).slice(2) +
            Date.now().toString(36)
        );
    }

    function now() {
        return new Date().toISOString();
    }

    function json(status, data) {
        return {
            status,
            ok: status >= 200 && status < 300,
            data
        };
    }

    function session() {
        return read(SESSION_KEY, null);
    }

    function adminSession() {
        return read(ADMIN_KEY, null);
    }

    function emptyGame() {
        return {
            questions: {},
            attempts: 0,
            firstAt: null,
            lastAt: null
        };
    }

    function currentUser() {
        const current = session();

        if (!current) {
            return null;
        }

        return (
            users().find(user => user.id === current.id) ||
            null
        );
    }

    /* ------------------------------ accounts ---------------------------- */

    function validateRegistration(body) {
        const fullName = String(body.fullName || "").trim();
        const email = String(body.email || "").trim();
        const password = String(body.password || "");
        const confirm = String(body.confirmPassword ?? password);

        if (fullName.length < 2) {
            return { message: "Please enter your full name." };
        }

        if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
            return { message: "Please enter a valid email address." };
        }

        if (password.length < 8) {
            return { message: "Use at least 8 characters for the password." };
        }

        if (!/[a-z]/i.test(password)) {
            return { message: "The password needs at least one letter." };
        }

        if (!/[0-9]/.test(password)) {
            return { message: "The password needs at least one number." };
        }

        if (password !== confirm) {
            return { message: "The two passwords do not match." };
        }

        return { fullName, email, password };
    }

    /* ------------------------------ summaries --------------------------- */

    function summarise(user) {
        const summary = {
            total: 0,
            maximum: MAXIMUM.total,
            answered: 0,
            correct: 0,
            questions: 25,
            games: {}
        };

        GAME_OPTIONS.forEach(option => {
            const id = option.id;
            const label = option.label;
            const maximum = option.maximum;
            const questionCount = option.questions;

            const game =
                (user.games && user.games[id]) ||
                emptyGame();

            let points = 0;
            let answered = 0;
            let correct = 0;

            Object.keys(game.questions || {}).forEach(key => {
                const record = game.questions[key] || {};

                points += Number(record.best || 0);
                answered += 1;

                if (record.correctEver) {
                    correct += 1;
                }
            });

            summary.games[id] = {
                id,
                label,
                title: label,
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
        });

        return summary;
    }

    function publicUser(user) {
        return {
            id: user.id,
            fullName: user.fullName,
            email: user.email,
            createdAt: user.createdAt || null,
            lastLoginAt: user.lastLoginAt || null,
            lastSeenAt: user.lastSeenAt || null,
            points: summarise(user)
        };
    }

    function questionRows(user) {
        const rows = [];

        GAME_OPTIONS.forEach(option => {
            const gameId = option.id;

            const game =
                (user.games && user.games[gameId]) ||
                emptyGame();

            Object.keys(game.questions || {})
                .sort((left, right) => {
                    const a = Number(left);
                    const b = Number(right);

                    if (Number.isFinite(a) && Number.isFinite(b)) {
                        return a - b;
                    }

                    return String(left).localeCompare(String(right));
                })
                .forEach(key => {
                    const record = game.questions[key] || {};

                    rows.push({
                        gameId,
                        gameLabel: option.label,

                        questionId: key,
                        label: record.label || key,

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

    function publicAdmin(admin) {
        return {
            username: admin.username || "",
            name: admin.name || admin.username || "Administrator",
            email: admin.email || null,
            role: admin.role || "admin"
        };
    }

    function adminIdentifier(admin) {
        return String(admin.username || admin.email || "")
            .toLowerCase();
    }

    function findAdmin(identifier) {
        const key = String(identifier || "").toLowerCase();

        return (
            admins().find(admin => {
                return (
                    adminIdentifier(admin) === key ||
                    String(admin.email || "").toLowerCase() === key
                );
            }) || null
        );
    }

    function adminMatches(admin, password) {
        if (admin.password) {
            return String(admin.password) === String(password);
        }

        if (admin.salt && admin.passwordHash) {
            return (
                admin.passwordHash ===
                hash(admin.salt + String(password))
            );
        }

        return false;
    }

    /* ------------------------------- scoring ---------------------------- */

    function recordAnswer(body) {
        const user = currentUser();

        if (!user) {
            return null;
        }

        const requested = String(body.gameId || "");
        const gameId = GAME_IDS.includes(requested)
            ? requested
            : GAME_IDS[0];

        const id = String(body.questionId ?? "");
        const awarded = Math.max(0, Number(body.points || 0));
        const maximum = Math.max(0, Number(body.maximum || 0));
        const correct = Boolean(body.correct);

        const game =
            user.games[gameId] ||
            (user.games[gameId] = emptyGame());

        const existing =
            game.questions[id] || {
                firstAt: now(),
                plays: 0,
                best: 0,
                correctEver: false
            };

        const record = {
            id,

            label: String(
                body.label ||
                "Problem " + id
            ),

            maximum,
            best: Math.max(Number(existing.best || 0), awarded),
            lastPoints: awarded,
            correct,
            correctEver: Boolean(existing.correctEver) || correct,

            answer: String(body.answer || body.card || ""),
            plays: Number(existing.plays || 0) + 1,
            firstAt: existing.firstAt || now(),
            lastAt: now()
        };

        game.questions[id] = record;
        game.attempts = Number(game.attempts || 0) + 1;
        game.lastAt = record.lastAt;
        game.firstAt = game.firstAt || record.lastAt;

        user.lastSeenAt = record.lastAt;

        saveUsers(
            users().map(item =>
                item.id === user.id ? user : item
            )
        );

        return {
            awarded,
            correct,
            maximum,
            gameId,
            questionId: id,
            record
        };
    }

    /* --------------------------------- CSV ------------------------------ */

    function csvCell(value) {
        const cell = String(
            value === null || value === undefined ? "" : value
        );

        return /[",\r\n]/.test(cell)
            ? '"' + cell.replaceAll('"', '""') + '"'
            : cell;
    }

    function csvRow(values) {
        return values.map(csvCell).join(",");
    }

    function csv(view) {
        const lines = [];
        const list = users();

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

            list.forEach(user => {
                questionRows(user).forEach(row => {
                    lines.push(csvRow([
                        user.fullName,
                        user.email,
                        row.gameLabel,
                        row.questionId,
                        row.label,
                        row.points,
                        row.maximum,
                        row.correctEver ? "yes" : "no",
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

                ...GAME_OPTIONS.flatMap(option => [
                    option.label + " AfriCOIN",
                    option.label + " maximum",
                    option.label + " answered",
                    option.label + " correct"
                ]),

                "Total AfriCOIN",
                "Total maximum"
            ]));

            list.forEach(user => {
                const points = summarise(user);

                lines.push(csvRow([
                    user.fullName,
                    user.email,
                    user.createdAt || "",
                    user.lastLoginAt || "",
                    user.lastSeenAt || "",

                    ...GAME_OPTIONS.flatMap(option => {
                        const game = points.games[option.id];

                        return [
                            game.points,
                            game.maximum,
                            game.answered,
                            game.correct
                        ];
                    }),

                    points.total,
                    points.maximum
                ]));
            });
        }

        return "\uFEFF" + lines.join("\r\n") + "\r\n";
    }

    /* ------------------------------- routing ---------------------------- */

    function handle(path, options) {
        const raw = String(path || "");
        const parts = raw.split("?");

        const route = parts[0]
            .replace(/^\/+/, "")
            .replace(/\/+$/, "");

        const query = Object.fromEntries(
            new URLSearchParams(parts[1] || "")
        );

        const body = (options && options.body) || {};
        const method = (options && options.method) || "GET";

        if (route === "api/health") {
            return json(200, {
                ok: true,
                service: "Richfield EDT900 Game Simulations (local browser database)",
                maximumTotal: MAXIMUM.total
            });
        }

        if (route === "api/register" && method === "POST") {
            const clean = validateRegistration(body);

            if (clean.message) {
                return json(400, { ok: false, message: clean.message });
            }

            const list = users();

            if (
                list.some(
                    user =>
                        user.email.toLowerCase() ===
                        clean.email.toLowerCase()
                )
            ) {
                return json(409, {
                    ok: false,

                    message:
                        "That email address is already registered. " +
                        "Please sign in instead."
                });
            }

            const stamp = now();

            const user = {
                id: "u" + (list.length + 1),
                fullName: clean.fullName,
                email: clean.email,
                salt: salt(),
                passwordHash: "",
                createdAt: stamp,
                lastLoginAt: stamp,
                lastSeenAt: stamp,
                games: {
                    sim0: emptyGame(),
                    sim1: emptyGame(),
                    sim2: emptyGame()
                }
            };

            user.passwordHash = hash(user.salt + clean.password);

            list.push(user);
            saveUsers(list);

            write(SESSION_KEY, { id: user.id, startedAt: stamp });

            return json(201, { ok: true, user: publicUser(user) });
        }

        if (route === "api/login" && method === "POST") {
            const email = String(body.email || "").trim();
            const password = String(body.password || "");

            const user = users().find(
                entry =>
                    entry.email.toLowerCase() ===
                    email.toLowerCase()
            );

            if (
                !user ||
                user.passwordHash !== hash(user.salt + password)
            ) {
                return json(401, {
                    ok: false,

                    message:
                        "Those details do not match an account. " +
                        "Check your email address and password."
                });
            }

            user.lastLoginAt = now();
            user.lastSeenAt = user.lastLoginAt;

            saveUsers(
                users().map(entry =>
                    entry.id === user.id ? user : entry
                )
            );

            write(SESSION_KEY, {
                id: user.id,
                startedAt: user.lastLoginAt
            });

            return json(200, { ok: true, user: publicUser(user) });
        }

        if (route === "api/logout") {
            write(SESSION_KEY, null);

            return json(200, { ok: true });
        }

        if (route === "api/me") {
            const user = currentUser();

            if (!user) {
                return json(401, {
                    ok: false,
                    message: "Not signed in.",
                    user: null
                });
            }

            user.lastSeenAt = now();

            saveUsers(
                users().map(entry =>
                    entry.id === user.id ? user : entry
                )
            );

            return json(200, { ok: true, user: publicUser(user) });
        }

        if (route === "api/answers" && method === "POST") {
            const result = recordAnswer(body);

            if (!result) {
                return json(401, {
                    ok: false,

                    message:
                        "Please sign in again so your points can be saved."
                });
            }

            return json(200, {
                ok: true,
                awarded: result.awarded,
                correct: result.correct,
                maximum: result.maximum,
                gameId: result.gameId,
                questionId: result.questionId,
                breakdown: null,

                record: {
                    points: result.record.best,
                    lastPoints: result.record.lastPoints,
                    plays: result.record.plays,
                    correct: result.record.correct,
                    correctEver: result.record.correctEver
                },

                user: publicUser(currentUser())
            });
        }

        if (route === "api/admin/login" && method === "POST") {
            const admin = findAdmin(
                body.username || body.email
            );

            if (!admin || !adminMatches(admin, body.password)) {
                return json(401, {
                    ok: false,

                    message: "Those admin details are not correct."
                });
            }

            write(ADMIN_KEY, {
                username: adminIdentifier(admin),
                startedAt: now()
            });

            return json(200, {
                ok: true,
                admin: publicAdmin(admin)
            });
        }

        if (route === "api/admin/logout") {
            write(ADMIN_KEY, null);

            return json(200, { ok: true });
        }

        if (route === "api/admin/me") {
            const current = adminSession();

            if (!current) {
                return json(401, { ok: false, signedIn: false });
            }

            const admin = findAdmin(current.username);

            if (!admin) {
                write(ADMIN_KEY, null);

                return json(401, { ok: false, signedIn: false });
            }

            return json(200, {
                ok: true,
                signedIn: true,
                admin: publicAdmin(admin),

                adminLogins: admins().map(entry => ({
                    username: entry.username,
                    name: entry.name || entry.username,
                    role: entry.role || "admin",

                    passwordProtected: Boolean(
                        entry.passwordHash && !entry.password
                    )
                }))
            });
        }

        if (route === "api/admin/password" && method === "POST") {
            const current = adminSession();

            if (!current) {
                return json(401, {
                    ok: false,
                    message: "Please sign in as admin first."
                });
            }

            const admin = findAdmin(current.username);

            if (!admin || !adminMatches(admin, body.currentPassword)) {
                return json(401, {
                    ok: false,

                    message:
                        "The current admin password is not correct."
                });
            }

            const next = String(body.newPassword || "");

            if (
                next.length < 8 ||
                !/[a-z]/i.test(next) ||
                !/[0-9]/.test(next)
            ) {
                return json(400, {
                    ok: false,

                    message:
                        "Use at least 8 characters with a letter and a number."
                });
            }

            const list = admins();

            const index = list.findIndex(
                entry =>
                    adminIdentifier(entry) ===
                    adminIdentifier(admin)
            );

            const updated = {
                ...(index >= 0 ? list[index] : admin),
                salt: salt(),
                updatedAt: now()
            };

            updated.passwordHash = hash(updated.salt + next);

            delete updated.password;

            if (index >= 0) {
                list[index] = updated;
            } else {
                list.push(updated);
            }

            write(ADMINS_KEY, list);

            return json(200, {
                ok: true,

                message:
                    "Password updated for " +
                    (updated.username || "the admin") +
                    "."
            });
        }

        if (route === "api/admin/users") {
            if (!adminSession()) {
                return json(401, {
                    ok: false,
                    signedIn: false,

                    message:
                        "Please sign in as admin to see the users."
                });
            }

            const rows = users()
                .map(publicUser)
                .sort((left, right) => {
                    const difference =
                        right.points.total - left.points.total;

                    return difference !== 0
                        ? difference
                        : left.fullName.localeCompare(
                            right.fullName
                        );
                });

            const totalPoints = rows.reduce(
                (sum, row) => sum + row.points.total,
                0
            );

            const today = now().slice(0, 10);

            function averageFor(gameId) {
                return rows.length
                    ? Math.round(
                        rows.reduce(
                            (sum, row) =>
                                sum +
                                row.points.games[gameId].points,
                            0
                        ) / rows.length
                    )
                    : 0;
            }

            return json(200, {
                ok: true,
                users: rows,

                summary: {
                    users: rows.length,
                    totalPoints,

                    averagePoints: rows.length
                        ? Math.round(totalPoints / rows.length)
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

                    games: GAME_OPTIONS.map(option => ({
                        id: option.id,
                        label: option.label,
                        title: option.label,
                        maximum: option.maximum,
                        average: averageFor(option.id)
                    })),

                    maximumTotal: MAXIMUM.total
                },

                generatedAt: now()
            });
        }

        if (route.indexOf("api/admin/users/") === 0) {
            if (!adminSession()) {
                return json(401, {
                    ok: false,
                    signedIn: false,

                    message:
                        "Please sign in as admin to see the users."
                });
            }

            const id = route.slice("api/admin/users/".length);

            const user = users().find(
                entry => entry.id === id
            );

            if (!user) {
                return json(404, {
                    ok: false,
                    message: "That user could not be found."
                });
            }

            return json(200, {
                ok: true,
                user: publicUser(user),
                questions: questionRows(user),
                generatedAt: now()
            });
        }

        return json(404, {
            ok: false,
            message: "Unknown API route: " + route
        });
    }

    window.LocalDb = {
        handle,
        csv,
        users,
        admins,
        maximum: MAXIMUM
    };
})();
