/**
 * Richfield EDT900 Game Simulations
 * ---------------------------------------------------------------
 * Local Node server (no dependencies) that serves the site and the
 * /api endpoints from JSON files in the data folder.
 *
 *   node server.mjs            then open http://localhost:5500
 *
 * Environment:
 *   PORT              web port (default 5500)
 *   HOST              interface to bind (default 0.0.0.0)
 *   ADMIN_USERNAME    admin login name (default "admin")
 *   ADMIN_PASSWORD    admin password (default "EDT900@2026"; only
 *                     used the first time, before the admin entry in
 *                     data/admins.json exists - edit that file to
 *                     start again)
 *
 * When the site is deployed to Netlify or Vercel the same API is
 * served by netlify/functions/api.mjs or api/[...route].mjs instead,
 * so nothing changes for the browser.
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ADMIN_LOGINS, initialAdmins } from "./lib/admin-seed.mjs";
import { createApi } from "./lib/api-core.mjs";
import { buildCatalog } from "./lib/game-catalog.mjs";
import { createJsonDbStore } from "./lib/kv-jsondb.mjs";
import { createRestStore, hasRestStore } from "./lib/kv-rest.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 5500);
const HOST = process.env.HOST || "0.0.0.0";

const DATA_DIR = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(ROOT, "data");
const MAX_BODY_BYTES = 16 * 1024;
const CACHE_MS = 60 * 60 * 1000;

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".pdf": "application/pdf"
};

const BLOCKED = [
    /^\/lib\//,
    /^\/data\//,
    /^\/scripts\//,
    /^\/netlify\//,
    /^\/node_modules\//,
    /^\/\./,
    /^\/(package|package-lock)\.json$/,
    /^\/server\.mjs$/,
    /^\/netlify\.toml$/,
    /^\/README\.md$/i
];

function readGameFile(name) {
    return JSON.parse(
        fs.readFileSync(
            path.join(ROOT, "assets", "data", name),
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

const seedAdmins = initialAdmins({
    username: process.env.ADMIN_USERNAME || "admin",
    password: process.env.ADMIN_PASSWORD || "EDT900@2026"
});

const api = createApi({
    catalog,

    kv: hasRestStore()
        ? createRestStore()
        : createJsonDbStore(DATA_DIR, { admins: seedAdmins }),

    config: {
        adminUsername:
            process.env.ADMIN_USERNAME || "admin",

        adminPassword:
            process.env.ADMIN_PASSWORD || "EDT900@2026",

        adminLogins: ADMIN_LOGINS,

        siteName: "Richfield EDT900 Game Simulations"
    }
});

function sendJson(response, status, payload, headers = {}) {
    const body = JSON.stringify(payload);

    response.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...headers
    });

    response.end(body);
}

function sendText(response, status, body, headers = {}) {
    response.writeHead(status, {
        "content-type": "text/plain; charset=utf-8",
        ...headers
    });

    response.end(body);
}

function isBlocked(pathname) {
    return BLOCKED.some(pattern =>
        pattern.test(pathname)
    );
}

function readBody(request) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];

        request.on("data", chunk => {
            size += chunk.length;

            if (size > MAX_BODY_BYTES) {
                reject(
                    new Error("Request body is too large.")
                );

                request.destroy();

                return;
            }

            chunks.push(chunk);
        });

        request.on("end", () => {
            const raw = Buffer
                .concat(chunks)
                .toString("utf8")
                .trim();

            if (!raw) {
                resolve(null);

                return;
            }

            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(
                    new Error("Request body is not valid JSON.")
                );
            }
        });

        request.on("error", reject);
    });
}

async function handleApi(request, response, pathname, query) {
    let body = null;

    try {
        if (
            request.method === "POST" ||
            request.method === "PUT"
        ) {
            body = await readBody(request);
        }
    } catch (error) {
        sendJson(response, 400, {
            ok: false,
            message: error.message
        });

        return;
    }

    const forwarded =
        String(
            request.headers["x-forwarded-proto"] || ""
        ).toLowerCase();

    const result = await api.handle({
        method: request.method,
        path: pathname,
        query,
        body,

        cookie:
            request.headers.cookie || "",

        secure:
            forwarded === "https" ||
            Boolean(request.socket.encrypted)
    });

    const headers = {
        ...result.headers
    };

    if (result.json !== undefined) {
        sendJson(
            response,
            result.status,
            result.json,
            headers
        );

        return;
    }

    sendText(
        response,
        result.status,
        String(result.text ?? ""),
        headers
    );
}

function sendFile(request, response, filePath) {
    const extension = path
        .extname(filePath)
        .toLowerCase();

    const headers = {
        "content-type":
            MIME_TYPES[extension] ||
            "application/octet-stream",

        "cache-control":
            extension === ".html"
                ? "no-cache"
                : "public, max-age=" + Math.floor(CACHE_MS / 1000),

        "x-content-type-options": "nosniff"
    };

    if (request.method === "HEAD") {
        response.writeHead(200, headers);
        response.end();

        return;
    }

    const stream = fs.createReadStream(filePath);

    stream.on("error", () => {
        sendText(response, 500, "Could not read the file.");
    });

    stream.on("open", () => {
        response.writeHead(200, headers);

        stream.pipe(response);
    });
}

function handleStatic(request, response, pathname) {
    if (
        request.method !== "GET" &&
        request.method !== "HEAD"
    ) {
        sendText(response, 405, "Method not allowed.");

        return;
    }

    if (isBlocked(pathname)) {
        sendText(response, 404, "Not found.");

        return;
    }

    let relative = "/index.html";

    try {
        relative = decodeURIComponent(pathname);
    } catch (error) {
        relative = pathname;
    }

    if (relative === "/" || relative === "") {
        relative = "/index.html";
    }

    const candidate = path.resolve(
        ROOT,
        "." + relative
    );

    if (
        candidate.indexOf(ROOT + path.sep) !== 0
    ) {
        sendText(response, 404, "Not found.");

        return;
    }

    fs.stat(candidate, (error, stats) => {
        if (!error && stats.isFile()) {
            sendFile(request, response, candidate);

            return;
        }

        if (!path.extname(candidate)) {
            const withHtml = candidate + ".html";

            fs.stat(withHtml, (htmlError, htmlStats) => {
                if (
                    !htmlError &&
                    htmlStats.isFile()
                ) {
                    sendFile(
                        request,
                        response,
                        withHtml
                    );

                    return;
                }

                sendText(response, 404, "Not found.");
            });

            return;
        }

        sendText(response, 404, "Not found.");
    });
}

const server = http.createServer(
    (request, response) => {
        let url = null;

        try {
            url = new URL(
                request.url,
                "http://localhost"
            );
        } catch (error) {
            sendText(response, 400, "Bad request.");

            return;
        }

        const query = Object.fromEntries(
            url.searchParams.entries()
        );

        if (url.pathname.startsWith("/api/")) {
            handleApi(
                request,
                response,
                url.pathname,
                query
            ).catch(error => {
                sendJson(response, 500, {
                    ok: false,
                    message: error.message
                });
            });

            return;
        }

        handleStatic(request, response, url.pathname);
    }
);

server.on("error", error => {
    if (error.code === "EADDRINUSE") {
        console.error(
            "Port " + PORT + " is already in use. " +
            "Try: set PORT=5501 && node server.mjs"
        );
    } else {
        console.error(
            "Server error: " + error.message
        );
    }

    process.exit(1);
});

server.listen(PORT, HOST, () => {
    console.log("");
    console.log("  Richfield EDT900 Game Simulations");
    console.log("  ----------------------------------------");
    console.log(
        "  Game            : http://localhost:" + PORT + "/"
    );
    console.log(
        "  Register        : http://localhost:" + PORT + "/register.html"
    );
    console.log(
        "  Sign in         : http://localhost:" + PORT + "/login.html"
    );
    console.log(
        "  Admin monitor   : http://localhost:" + PORT + "/admin.html"
    );
    console.log("");
    console.log("");
    console.log(
        "  Store           : " +
        (
            hasRestStore()
                ? "hosted key/value store (KV_REST_API_URL)"
                : "JSON files in " + DATA_DIR
        )
    );

    if (!hasRestStore()) {
        console.log(
            "  Players file    : " + path.join(DATA_DIR, "users.json")
        );

        console.log(
            "  Admins file     : " + path.join(DATA_DIR, "admins.json")
        );
    }

    console.log("");
    console.log("  Administrator logins:");

    seedAdmins.forEach(admin => {
        console.log(
            "    - " +
            admin.username +
            "  /  " +
            (admin.password || "(password changed in the score monitor)")
        );
    });

    console.log("");
    console.log(
        "  AfriCOIN available: " +
        catalog.maximumTotal +
        " (Simulation 0: " +
        catalog.games.sim0.maximum +
        ", Simulation 1: " +
        catalog.games.sim1.maximum +
        ", Simulation 2: " +
        catalog.games.sim2.maximum +
        ")"
    );
    console.log("");
});
