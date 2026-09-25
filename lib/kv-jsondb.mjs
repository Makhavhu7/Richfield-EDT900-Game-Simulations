/**
 * Game Testing - GLA
 * ---------------------------------------------------------------
 * JSON file database used by the local Node server (server.mjs).
 * No database server is needed: the whole application reads and
 * writes three small, readable files.
 *
 *   data/users.json     every player account with their points
 *   data/admins.json    the admin logins (readable, editable)
 *   data/sessions.json  active sign-in sessions
 *   data/runtime.json   small runtime notes (failed login counters)
 *
 * The store speaks the same key/value interface as the hosted
 * stores, so the API code does not change between local mode and
 * Vercel / Netlify.
 */

import fs from "node:fs";
import path from "node:path";

function digits(value) {
    const match = String(value).match(/\d+/);

    return match ? Number(match[0]) : 0;
}

export function createJsonDbStore(directory, options = {}) {
    const usersFile = path.join(directory, "users.json");
    const adminsFile = path.join(directory, "admins.json");
    const sessionsFile = path.join(directory, "sessions.json");
    const runtimeFile = path.join(directory, "runtime.json");

    fs.mkdirSync(directory, { recursive: true });

    function read(file, fallback) {
        try {
            const parsed = JSON.parse(
                fs.readFileSync(file, "utf8")
            );

            return parsed === null || parsed === undefined
                ? fallback
                : parsed;
        } catch (error) {
            return fallback;
        }
    }

    function write(file, value) {
        const temporary = file + ".tmp";

        fs.writeFileSync(
            temporary,
            JSON.stringify(value, null, 2) + "\n",
            "utf8"
        );

        fs.renameSync(temporary, file);
    }

    function readUsers() {
        const users = read(usersFile, []);

        return Array.isArray(users) ? users : [];
    }

    function readAdmins() {
        const admins = read(adminsFile, []);

        return Array.isArray(admins) ? admins : [];
    }

    function writeUsers(users) {
        write(usersFile, users);
    }

    function writeSessions(sessions) {
        write(sessionsFile, sessions);
    }

    /* --------------------------- first run --------------------------- */

    if (!fs.existsSync(usersFile)) {
        writeUsers([]);
    }

    if (!readAdmins().length) {
        write(adminsFile, options.admins || []);
    }

    return {
        /** Where the data lives, for log messages. */
        location: directory,

        async get(key) {
            const name = String(key);

            if (name === "userIndex") {
                const ids = readUsers()
                    .map(user => String(user.id));

                const highest = ids.reduce(
                    (maximum, id) =>
                        Math.max(maximum, digits(id)),
                    0
                );

                return { ids, next: highest + 1 };
            }

            if (name.startsWith("user:")) {
                const id = name.slice("user:".length);

                return (
                    readUsers().find(
                        user => String(user.id) === id
                    ) || null
                );
            }

            if (name.startsWith("session:") ||
                name.startsWith("adminSession:")) {
                return read(sessionsFile, {})[name] || null;
            }

            if (name === "admins") {
                return readAdmins();
            }

            if (name.startsWith("throttle:")) {
                return read(runtimeFile, {})[name] || null;
            }

            return null;
        },

        async set(key, value) {
            const name = String(key);

            // The id list is always derived from users.json itself.
            if (name === "userIndex") {
                return true;
            }

            if (name.startsWith("user:")) {
                const users = readUsers();

                const index = users.findIndex(
                    user =>
                        String(user.id) ===
                        String(value?.id)
                );

                if (index >= 0) {
                    users[index] = value;
                } else {
                    users.push(value);
                }

                writeUsers(users);

                return true;
            }

            if (name === "admins") {
                write(adminsFile, value);

                return true;
            }

            if (name.startsWith("session:") ||
                name.startsWith("adminSession:")) {
                const sessions = read(sessionsFile, {});

                sessions[name] = value;

                writeSessions(sessions);

                return true;
            }

            if (name.startsWith("throttle:")) {
                const runtime = read(runtimeFile, {});

                runtime[name] = value;

                write(runtimeFile, runtime);

                return true;
            }

            return true;
        },

        async remove(key) {
            const name = String(key);

            if (name.startsWith("session:") ||
                name.startsWith("adminSession:")) {
                const sessions = read(sessionsFile, {});

                delete sessions[name];

                writeSessions(sessions);

                return true;
            }

            if (name.startsWith("throttle:")) {
                const runtime = read(runtimeFile, {});

                delete runtime[name];

                write(runtimeFile, runtime);

                return true;
            }

            return true;
        }
    };
}
