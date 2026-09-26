/**
 * Richfield EDT900 Game Simulations
 * ---------------------------------------------------------------
 * Checks the browser fallback: when the API answers 500 because its
 * store cannot be used (no hosted key/value store, or a deployment
 * with a read-only filesystem), assets/js/api-client.js must switch
 * to the browser database so registration, sign in and scoring keep
 * working, and it must leave a real server error alone.
 *
 *   node scripts/fallback-check.mjs
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(
    fileURLToPath(new URL("..", import.meta.url))
);

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

/** Builds the smallest browser the two scripts need. */
function browser(answer) {
    const storage = new Map();
    const note = { hidden: true, textContent: "" };
    const calls = [];

    const window = {
        localStorage: {
            getItem: key =>
                storage.has(key) ? storage.get(key) : null,

            setItem: (key, value) =>
                storage.set(key, String(value)),

            removeItem: key => storage.delete(key)
        },

        crypto: globalThis.crypto,
        setTimeout,
        clearTimeout,
        console,
        URL,
        Blob: globalThis.Blob,
        URLSearchParams,

        location: {
            search: "",
            href: "https://example.test/register.html"
        },

        document: {
            querySelectorAll: () => [note],
            querySelector: () => null,

            createElement: () => ({
                style: {},
                click() {},
                remove() {}
            }),

            body: { appendChild() {} }
        },

        fetch: async url => {
            calls.push(String(url));

            return answer();
        }
    };

    window.window = window;
    window.globalThis = window;

    const context = vm.createContext(window);

    [
        "assets/js/local-db.js",
        "assets/js/api-client.js"
    ].forEach(name => {
        vm.runInContext(
            fs.readFileSync(path.join(root, name), "utf8"),
            context,
            { filename: name }
        );
    });

    return {
        api: window.GameApi,
        note,
        calls,
        storage
    };
}

function storeError(message) {
    return () => ({
        status: 500,
        ok: false,

        headers: { get: () => "application/json" },

        json: async () => ({ ok: false, message }),
        text: async () => ""
    });
}

const player = {
    fullName: "Fallback Player",
    email: "fallback@example.com",
    password: "Ghost1234",
    confirmPassword: "Ghost1234"
};

console.log(
    "\nRichfield EDT900 - browser fallback check\n" +
    "===========================================\n"
);

/* ------------- a deployment that cannot write its store ------------- */

const readOnly = browser(storeError(
    "Server error: EROFS: read-only file system, " +
    "open '/var/task/data/users.json.tmp'"
));

check(
    "The client starts in server mode",
    readOnly.api.mode() === "server",
    readOnly.api.mode()
);

const registered = await readOnly.api.call("api/register", {
    method: "POST",
    body: player
});

check(
    "A read-only deployment switches to the browser database",
    readOnly.api.mode() === "local",
    readOnly.api.mode()
);

check(
    "Registration then succeeds in the browser database",
    registered.status === 201 && registered.ok === true,
    registered.status + " " +
    String(registered.data?.message || "")
);

check(
    "The player is told where the data lives",
    /Local test mode/.test(readOnly.note.textContent),
    readOnly.note.textContent.slice(0, 80)
);

check(
    "The same player can read their account back",
    (await readOnly.api.call("api/me")).data?.user?.email ===
    "fallback@example.com",
    JSON.stringify(
        (await readOnly.api.call("api/me")).data
    ).slice(0, 120)
);

/* ------------- a hosted store that is not configured yet ------------ */

const noStore = browser(storeError(
    "Server error: No hosted key/value store is configured. " +
    "Add the Upstash Redis (Vercel KV) integration to the project."
));

await noStore.api.call("api/health");

check(
    "An unconfigured store also switches to the browser database",
    noStore.api.mode() === "local",
    noStore.api.mode()
);

/* ---------------- a real server error must stay visible ------------- */

const broken = browser(storeError("Server error: boom"));

const answer = await broken.api.call("api/register", {
    method: "POST",
    body: player
});

check(
    "A real server error keeps the client in server mode",
    broken.api.mode() === "server" &&
    answer.status === 500 &&
    /boom/.test(String(answer.data?.message || "")),
    broken.api.mode() + " " +
    String(answer.data?.message || "")
);

check(
    "The server is asked exactly once per call",
    broken.calls.length === 1,
    String(broken.calls.length)
);

console.log(
    "\n-------------------------------------------\n" +
    "Passed: " + passed + "\n" +
    "Failed: " + failed + "\n"
);

process.exit(failed === 0 ? 0 : 1);
