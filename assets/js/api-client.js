/**
 * Richfield EDT900 Game Simulations
 * ---------------------------------------------------------------
 * Small browser helper shared by index.html, login.html,
 * register.html, game.html and admin.html.
 *
 * Every page talks to the same relative /api endpoints, so the same
 * code works locally (node server.mjs) and on Netlify
 * (netlify/functions/api.mjs).
 */

(function () {
    "use strict";

    let localMode = false;

    /**
     * Switches to the browser database (assets/js/local-db.js) when
     * the game server is not reachable, so registration, sign in,
     * points and the score monitor keep working and the JSON files in
     * data/ stay the shared database whenever the server is running.
     */
    function useLocalMode(reason) {
        if (localMode || !window.LocalDb) {
            return localMode;
        }

        localMode = true;

        console.info(
            "Richfield EDT900: no game server found, using the " +
            "browser database instead. Reason: " +
            (reason || "unreachable")
        );

        renderModeNote();

        return true;
    }

    function renderModeNote() {
        document
            .querySelectorAll("[data-db-note]")
            .forEach(node => {
                node.hidden = !localMode;

                node.textContent = localMode
                    ? "Local test mode: accounts and AfriCOIN are kept in " +
                    "this browser only. Run \"node server.mjs\" to use " +
                    "the shared JSON database (data/users.json and " +
                    "data/admins.json)."
                    : "";
            });
    }

    function localCall(path, options) {
        try {
            return window.LocalDb.handle(path, options);
        } catch (error) {
            return {
                status: 500,
                ok: false,

                data: {
                    ok: false,
                    message:
                        "The browser database could not be used: " +
                        (error?.message || String(error))
                }
            };
        }
    }

    async function call(path, options) {
        const config = options || {};

        if (localMode) {
            return localCall(path, config);
        }

        const settings = {
            method: config.method || "GET",

            credentials: "same-origin",
            cache: "no-store",

            headers: {
                Accept: "application/json"
            }
        };

        if (config.body) {
            settings.headers["Content-Type"] =
                "application/json";

            settings.body = JSON.stringify(config.body);
        }

        let response = null;

        try {
            response = await fetch(path, settings);
        } catch (error) {
            if (useLocalMode("server not reachable")) {
                return localCall(path, config);
            }

            return {
                status: 0,
                ok: false,

                data: {
                    ok: false,

                    message:
                        "The game server could not be reached. " +
                        "Start it with \"node server.mjs\" to use the " +
                        "JSON database in data/."
                }
            };
        }

        const type =
            response.headers.get("content-type") || "";

        const data = type.includes("application/json")
            ? await response.json()
            : { ok: response.ok, text: await response.text() };

        // A hosted store that is not configured yet (for example a
        // Vercel preview without Upstash Redis, or a deployment whose
        // filesystem is read-only) answers 500 - the browser database
        // takes over so the session can continue.
        if (
            response.status >= 500 &&
            /key\/value store|could not start|read-only file system/i.test(
                String(data.message || "")
            ) &&
            useLocalMode("hosted store not configured")
        ) {
            return localCall(path, config);
        }

        if (window.LocalDb) {
            renderModeNote();
        }

        return {
            status: response.status,
            ok: response.ok,
            data
        };
    }

    function nextPage() {
        const requested =
            new URLSearchParams(
                window.location.search
            ).get("next") || "";

        return /^[A-Za-z0-9._-]+\.html$/.test(requested)
            ? requested
            : "game.html";
    }

    const api = {
        call,
        nextPage,

        /** "server" when /api answers, "local" when the browser database runs. */
        mode() {
            return localMode ? "local" : "server";
        },

        /** Downloads a CSV export in whichever mode is active. */
        downloadCsv(view) {
            const name =
                "edt900-game-simulations-" +
                (view || "summary") +
                ".csv";

            if (localMode && window.LocalDb) {
                const csv = window.LocalDb.csv(
                    view || "summary"
                );

                const url = URL.createObjectURL(
                    new Blob(
                        [csv],
                        { type: "text/csv;charset=utf-8" }
                    )
                );

                const link = document.createElement("a");

                link.href = url;
                link.download = name;

                document.body.appendChild(link);
                link.click();
                link.remove();

                URL.revokeObjectURL(url);

                return;
            }

            window.location.assign(api.adminCsvUrl(view));
        },

        register: body =>
            call("api/register", {
                method: "POST",
                body
            }),

        login: body =>
            call("api/login", {
                method: "POST",
                body
            }),

        logout: () =>
            call("api/logout", { method: "POST" }),

        me: () => call("api/me"),

        health: () => call("api/health"),

        submit: body =>
            call("api/answers", {
                method: "POST",
                body
            }),

        adminLogin: body =>
            call("api/admin/login", {
                method: "POST",
                body
            }),

        adminLogout: () =>
            call("api/admin/logout", { method: "POST" }),

        adminMe: () => call("api/admin/me"),

        adminUsers: () => call("api/admin/users"),

        locks: () => call("api/locks"),

        adminLock: body =>
            call("api/admin/locks", {
                method: "POST",
                body
            }),

        adminUser: id =>
            call(
                "api/admin/users/" +
                encodeURIComponent(id)
            ),

        adminCsvUrl: view =>
            "api/admin/users.csv?view=" +
            encodeURIComponent(view || "summary"),

        /** Signs the player out and returns to the sign-in page. */
        async signOut() {
            await api.logout();

            window.location.replace("login.html");
        },

        /**
         * Waits for the account and sends visitors to the sign-in
         * page when they are not signed in yet.
         */
        async requireUser() {
            const result = await api.me();

            if (!result.data || !result.data.ok) {
                window.location.replace(
                    "login.html?next=" +
                    encodeURIComponent(
                        window.location.pathname
                            .split("/")
                            .pop() || "game.html"
                    )
                );

                return null;
            }

            api.renderSession(result.data.user);

            return result.data.user;
        },

        /** Fills the header chip with the signed-in account. */
        renderSession(user) {
            document
                .querySelectorAll("[data-user-name]")
                .forEach(node => {
                    node.textContent =
                        user?.fullName || "";
                });

            api.renderPoints(user);

            document
                .querySelectorAll("[data-sign-out]")
                .forEach(button => {
                    button.hidden = false;

                    button.addEventListener("click", event => {
                        event.preventDefault();

                        api.signOut();
                    });
                });
        },

        /** Updates every points badge on the page. */
        renderPoints(user) {
            const summary = user?.points;

            if (!summary) {
                return;
            }

            document
                .querySelectorAll("[data-user-points]")
                .forEach(node => {
                    node.textContent =
                        summary.total +
                        " / " +
                        summary.maximum;
                });

            document
                .querySelectorAll("[data-game-points]")
                .forEach(node => {
                    const game =
                        summary.games?.[
                        node.dataset.gamePoints
                        ];

                    node.textContent = game
                        ? game.points +
                        " / " +
                        game.maximum
                        : "0";
                });
        },

        formatStamp(value) {
            if (!value) {
                return "—";
            }

            const date = new Date(value);

            if (Number.isNaN(date.getTime())) {
                return "—";
            }

            return date.toLocaleString([], {
                year: "numeric",
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit"
            });
        },

        escapeHtml(value) {
            return String(value ?? "")
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll('"', "&quot;")
                .replaceAll("'", "&#039;");
        }
    };

    window.GameApi = api;
})();