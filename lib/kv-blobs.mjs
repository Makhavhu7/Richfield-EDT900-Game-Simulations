/**
 * Richfield EDT900 Game Simulations
 * ---------------------------------------------------------------
 * Netlify Blobs key/value adapter.
 *
 * Only the Netlify function imports this module, so the local Node
 * server keeps running with zero dependencies.
 */

import { getStore } from "@netlify/blobs";

const STORE_NAME = "edt900-game-simulations";

export function createBlobsStore() {
    let store = null;

    // Netlify injects the Blobs context at runtime, so the store is
    // opened on first use instead of when the function is imported.
    function open() {
        if (!store) {
            store = getStore({
                name: STORE_NAME,
                consistency: "strong"
            });
        }

        return store;
    }

    return {
        async get(key) {
            return open().get(
                String(key),
                { type: "json" }
            );
        },

        async set(key, value) {
            await open().setJSON(
                String(key),
                value
            );

            return true;
        },

        async remove(key) {
            try {
                await open().delete(String(key));
            } catch (error) {
                /* already gone */
            }

            return true;
        }
    };
}
