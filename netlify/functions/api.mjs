/**
 * Richfield EDT900 Game Simulations
 * ---------------------------------------------------------------
 * Netlify function that serves the whole /api surface when the site
 * is deployed (or when it runs through `npx netlify dev`).
 *
 * Accounts, sessions and AfriCOIN are stored in Netlify Blobs, so the
 * admin monitor can see every player from any device.
 *
 * netlify.toml rewrites /api/* to this function.
 */

import sim0 from "../../assets/data/EDT900_Simulation_0_AI_Detective.json";
import sim1 from "../../assets/data/EDT900_Major_Simulation_1_Gauteng_Smart_Supply.json";
import sim2 from "../../assets/data/EDT900_Major_Simulation_2_Africa_2035_Boardroom.json";

import { ADMIN_LOGINS } from "../../lib/admin-seed.mjs";
import { createApi } from "../../lib/api-core.mjs";
import { buildCatalog } from "../../lib/game-catalog.mjs";
import { createBlobsStore } from "../../lib/kv-blobs.mjs";

const catalog = buildCatalog({ sim0, sim1, sim2 });

let cachedApi = null;

function getApi() {
    if (!cachedApi) {
        cachedApi = createApi({
            catalog,
            kv: createBlobsStore(),

            config: {
                adminUsername:
                    process.env.ADMIN_USERNAME || "admin",

                adminPassword:
                    process.env.ADMIN_PASSWORD || "EDT900@2026",

                adminLogins: ADMIN_LOGINS,

                siteName: "Richfield EDT900 Game Simulations"
            }
        });
    }

    return cachedApi;
}

function requestPath(event) {
    const raw = String(event.rawUrl || "");

    if (raw) {
        try {
            const pathname = new URL(raw).pathname;

            if (pathname.startsWith("/api/")) {
                return pathname;
            }
        } catch (error) {
            /* fall through to event.path */
        }
    }

    const path = String(event.path || "");

    if (path.startsWith("/api/")) {
        return path;
    }

    const marker = "/.netlify/functions/api";
    const index = path.indexOf(marker);

    if (index === 0) {
        const rest = path.slice(marker.length);

        return "/api" + (rest || "/health");
    }

    return path;
}

function requestQuery(event) {
    const raw = String(event.rawUrl || "");

    if (raw) {
        try {
            return Object.fromEntries(
                new URL(raw).searchParams.entries()
            );
        } catch (error) {
            /* fall through */
        }
    }

    return event.queryStringParameters || {};
}

function requestBody(event) {
    const raw = event.body;

    if (!raw) {
        return null;
    }

    const text = event.isBase64Encoded
        ? Buffer.from(raw, "base64").toString("utf8")
        : String(raw);

    if (!text.trim()) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        return null;
    }
}

function isSecure(event) {
    const headers = event.headers || {};

    const forwarded = String(
        headers["x-forwarded-proto"] || ""
    ).toLowerCase();

    if (forwarded) {
        return forwarded.split(",")[0].trim() === "https";
    }

    return String(event.rawUrl || "")
        .toLowerCase()
        .startsWith("https://");
}

export async function handler(event) {
    const headers = event.headers || {};

    let result = null;

    try {
        const api = getApi();

        result = await api.handle({
            method: event.httpMethod,
            path: requestPath(event),
            query: requestQuery(event),
            body: requestBody(event),

            cookie:
                headers.cookie ||
                headers.Cookie ||
                "",

            secure: isSecure(event)
        });
    } catch (error) {
        result = {
            status: 500,

            headers: {
                "content-type":
                    "application/json; charset=utf-8"
            },

            json: {
                ok: false,

                message:
                    "The API could not start: " +
                    (
                        error?.message ||
                        String(error)
                    ) +
                    ". When running locally, either use " +
                    "`node server.mjs` or run `npx netlify dev` " +
                    "so Netlify Blobs is available."
            }
        };
    }

    const responseHeaders = {
        "cache-control": "no-store",
        ...result.headers
    };

    const body =
        result.json !== undefined
            ? JSON.stringify(result.json)
            : String(result.text ?? "");

    responseHeaders["content-type"] =
        responseHeaders["content-type"] ||
        (
            result.json !== undefined
                ? "application/json; charset=utf-8"
                : "text/plain; charset=utf-8"
        );

    return {
        statusCode: result.status,
        headers: responseHeaders,
        body,
        isBase64Encoded: false
    };
}
