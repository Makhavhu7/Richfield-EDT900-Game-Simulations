/**
 * Richfield EDT900 Game Simulations
 * ---------------------------------------------------------------
 * Builds the static folder that Vercel publishes (public/).
 *
 * Vercel runs this automatically because vercel.json sets it as the
 * build command with  "outputDirectory": "public"  - so the deployed
 * site always contains every page and every asset, whatever the
 * project's build settings were before.
 *
 *   node scripts/build-vercel.mjs      (or: npm run build:vercel)
 *
 * The local Node server (server.mjs) and Netlify both keep serving
 * the project straight from the repository root, so nothing changes
 * for local development.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
    fileURLToPath(new URL("..", import.meta.url))
);

const outDir = path.join(root, "public");

const PAGES = [
    "index.html",
    "game.html",
    "login.html",
    "register.html",
    "admin.html"
];

const FOLDERS = [
    "assets"
];

/* Files that must exist in the published bundle. */
const REQUIRED = [
    "index.html",
    "game.html",
    "login.html",
    "register.html",
    "admin.html",
    "assets/css/style.css",
    "assets/css/theme.css",
    "assets/css/auth.css",
    "assets/css/quiz-games.css",
    "assets/js/api-client.js",
    "assets/js/local-db.js",
    "assets/js/quiz-games.js",
    "assets/js/admin.js",
    "assets/data/EDT900_Simulation_0_AI_Detective.json",
    "assets/data/EDT900_Major_Simulation_1_Gauteng_Smart_Supply.json",
    "assets/data/EDT900_Major_Simulation_2_Africa_2035_Boardroom.json"
];

function copyFile(from, to) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
}

function copyFolder(name) {
    const source = path.join(root, name);

    if (!fs.existsSync(source)) {
        return 0;
    }

    let count = 0;

    (function walk(directory) {
        fs.readdirSync(directory, { withFileTypes: true })
            .forEach(entry => {
                const from = path.join(directory, entry.name);

                if (entry.isDirectory()) {
                    walk(from);
                    return;
                }

                copyFile(
                    from,
                    path.join(
                        outDir,
                        path.relative(root, from)
                    )
                );

                count += 1;
            });
    })(source);

    return count;
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let files = 0;

PAGES.forEach(page => {
    const source = path.join(root, page);

    if (!fs.existsSync(source)) {
        console.error("Missing page: " + page);
        process.exit(1);
    }

    copyFile(source, path.join(outDir, page));

    files += 1;
});

FOLDERS.forEach(folder => {
    files += copyFolder(folder);
});

const missing = REQUIRED.filter(
    name => !fs.existsSync(path.join(outDir, name))
);

if (missing.length) {
    console.error(
        "The published bundle is incomplete. Missing:\n  " +
        missing.join("\n  ")
    );

    process.exit(1);
}

console.log(
    "Vercel bundle ready in public/ (" +
    files + " files, " +
    REQUIRED.length + " required files verified)"
);
