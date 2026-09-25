/**
 * Game Testing - GLA
 * ---------------------------------------------------------------
 * Key/value adapter for a hosted Redis that speaks the Upstash REST
 * protocol. This is what runs on Vercel: add the free Upstash Redis
 * (Vercel KV) integration to the project and Vercel injects
 * KV_REST_API_URL and KV_REST_API_TOKEN, or set the Upstash names
 * yourself.
 *
 * No dependencies: plain fetch calls.
 */

function config() {
    const url = String(
        process.env.KV_REST_API_URL ||
        process.env.UPSTASH_REDIS_REST_URL ||
        ""
    ).replace(/\/+$/, "");

    const token = String(
        process.env.KV_REST_API_TOKEN ||
        process.env.UPSTASH_REDIS_REST_TOKEN ||
        ""
    );

    return { url, token };
}

/** True when a hosted key/value store has been configured. */
export function hasRestStore() {
    const { url, token } = config();

    return Boolean(url && token);
}

function missingStoreError() {
    return new Error(
        "No hosted key/value store is configured. Add the Upstash Redis " +
        "(Vercel KV) integration to the project so KV_REST_API_URL and " +
        "KV_REST_API_TOKEN are available, then try again."
    );
}

async function send(command, key, body) {
    const { url, token } = config();

    if (!url || !token) {
        throw missingStoreError();
    }

    const response = await fetch(
        url + "/" + command + "/" + encodeURIComponent(key),
        {
            method: body === undefined ? "GET" : "POST",

            headers: {
                Authorization: "Bearer " + token,
                "Content-Type": "text/plain"
            },

            body,
            cache: "no-store"
        }
    );

    if (!response.ok) {
        const detail = await response.text();

        throw new Error(
            "The key/value store refused the " +
            command +
            " command (" +
            response.status +
            "): " +
            detail.slice(0, 200)
        );
    }

    return response.json();
}

export function createRestStore() {
    return {
        async get(key) {
            const payload = await send("get", key);

            const value = payload?.result;

            if (value === null || value === undefined) {
                return null;
            }

            // Some deployments return the stored JSON already parsed.
            if (typeof value === "object") {
                return value;
            }

            try {
                return JSON.parse(String(value));
            } catch (error) {
                return null;
            }
        },

        async set(key, value) {
            await send("set", key, JSON.stringify(value));

            return true;
        },

        async remove(key) {
            await send("del", key);

            return true;
        }
    };
}
