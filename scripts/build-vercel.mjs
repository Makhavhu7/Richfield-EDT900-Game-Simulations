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

/* Extensions the function can send from its own bundle. */
const TEXT_TYPES = [
    ".html",
    ".css",
    ".js",
    ".json",
    ".svg",
    ".txt"
];

/* The committed copy of the published files for the Vercel function. */
const bundleModule = path.join(
    root,
    "lib",
    "published-bundle.mjs"
);

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

/*
 * Vercel's function bundles whatever its includeFiles glob picks up, but a
 * project that keeps an old Output Directory in its dashboard settings can
 * leave the function without those files. This module is committed, so the
 * function always carries a copy of every page and asset it serves as a
 * backstop (see lib/api-core.mjs, publishedFile).
 */

const published = new Map();

REQUIRED.forEach(name => {
    published.set(name, fs.readFileSync(path.join(outDir, name), "utf8"));
});

FOLDERS.forEach(folder => {
    const source = path.join(root, folder);

    if (!fs.existsSync(source)) {
        return;
    }

    (function walk(directory) {
        fs.readdirSync(directory, { withFileTypes: true })
            .forEach(entry => {
                const from = path.join(directory, entry.name);

                if (entry.isDirectory()) {
                    walk(from);
                    return;
                }

                if (
                    !TEXT_TYPES.includes(
                        path.extname(entry.name).toLowerCase()
                    )
                ) {
                    return;
                }

                const name = path.relative(root, from)
                    .split(path.sep)
                    .join("/");

                published.set(
                    name,
                    fs.readFileSync(from, "utf8")
                );
            });
    })(source);
});

const names = Array.from(published.keys()).sort();

const moduleText = [
    "/**",
    " * Richfield EDT900 Game Simulations",
    " * ---------------------------------------------------------------",
    " * Generated by scripts/build-vercel.mjs - do not edit by hand.",
    " *",
    " * The Vercel function imports this map so it can send every page",
    " * and asset even when the deployment's static step does not carry",
    " * them (see vercel.json and README, \"Deploying to Vercel\").",
    " *",
    " *   npm run build:vercel      regenerates this file",
    " */",
    "",
    "export const PUBLISHED_FILES = {",
    ...names.map(name =>
        "    " + JSON.stringify(name) + ": " +
        JSON.stringify(published.get(name)) + ","
    ),
    "};",
    "",
    "export default PUBLISHED_FILES;",
    ""
].join("\n");

fs.writeFileSync(bundleModule, moduleText, "utf8");

console.log(
    "Vercel bundle ready in public/ (" +
    files + " files, " +
    REQUIRED.length + " required files verified)"
);

console.log(
    "Function copy written to lib/published-bundle.mjs (" +
    names.length + " files)"
);
