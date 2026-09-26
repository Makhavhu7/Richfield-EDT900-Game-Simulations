/**
 * Richfield EDT900 Game Simulations
 * ---------------------------------------------------------------
 * Checks a deployed site (Vercel, Netlify or the local server):
 * every page, stylesheet, script and file the pages reference must
 * answer 200. Use it after a deployment to confirm the styling is
 * being served, and to see which git commit the deployment runs.
 *
 *   node scripts/live-check.mjs
 *   node scripts/live-check.mjs https://example.vercel.app
 *   node scripts/live-check.mjs http://localhost:5500
 */

const base = String(
    process.argv[2] ||
    process.env.SITE_URL ||
    "https://richfield-game-simulation.vercel.app"
).replace(/\/+$/, "");

const PAGES = [
    "/",
    "/game",
    "/login",
    "/register",
    "/admin"
];

const SHEETS = [
    "/assets/css/style.css",
    "/assets/css/theme.css",
    "/assets/css/auth.css",
    "/assets/css/quiz-games.css"
];

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

function typeOf(response) {
    return String(
        response.headers.get("content-type") || ""
    ).split(";")[0];
}

async function get(path) {
    const response = await fetch(base + path, {
        redirect: "manual"
    });

    return response;
}

console.log(
    "\nRichfield EDT900 - live check\n" +
    "==========================================\n" +
    "site: " + base + "\n"
);

/* ------------------------------ the pages ----------------------------- */

for (const page of PAGES) {
    const response = await get(page);

    check(
        "GET " + page + " answers HTML",
        response.status === 200 &&
        typeOf(response).startsWith("text/html"),
        response.status + " " + typeOf(response)
    );
}

/* --------------------------- the stylesheets -------------------------- */

for (const sheet of SHEETS) {
    const response = await get(sheet);

    check(
        "GET " + sheet + " answers CSS",
        response.status === 200 &&
        typeOf(response).startsWith("text/css"),
        response.status + " " + typeOf(response)
    );
}

/* ----------------- everything else the pages ask for ------------------ */

const wanted = new Set();

for (const page of PAGES) {
    const response = await get(page);
    const html = await response.text();

    for (const match of html.matchAll(
        /(?:href|src)="([^"]+)"/g
    )) {
        const url = match[1];

        if (url.startsWith("http") || url.startsWith("#")) {
            continue;
        }

        wanted.add(
            new URL(url, base + page).pathname
        );
    }
}

for (const sheet of SHEETS) {
    const response = await get(sheet);
    const css = await response.text();

    for (const match of css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
        const url = match[2];

        if (url.startsWith("http") || url.startsWith("data:")) {
            continue;
        }

        wanted.add(
            new URL(url, base + "/assets/css/").pathname
        );
    }
}

const links = [...wanted].sort();

for (const link of links) {
    const response = await get(link);

    check(
        "GET " + link + " is reachable",
        response.status === 200 || response.status === 308,
        String(response.status)
    );
}

let scripts = 0;

for (const link of links) {
    if (!link.endsWith(".js")) {
        continue;
    }

    const response = await get(link);

    if (
        response.status === 200 &&
        typeOf(response).startsWith("text/javascript")
    ) {
        scripts += 1;
    }
}

check(
    "Every requested script answers JavaScript",
    scripts ===
    links.filter(link => link.endsWith(".js")).length,
    scripts + " of " +
    links.filter(link => link.endsWith(".js")).length
);

/* ------------------------------ the API ------------------------------- */

const health = await get("/api/health");

let report = null;

try {
    report = await health.json();
} catch (error) {
    report = null;
}

check(
    "GET /api/health answers",
    health.status === 200 && report?.maximumTotal === 660,
    health.status + " " + String(report?.maximumTotal)
);

console.log(
    "\n  deployment commit : " +
    (
        report?.commit
            ? report.commit.slice(0, 8)
            : "(not reported by this host)"
    ) +
    "\n  bundled files     : " +
    (report?.published?.bundle ?? "(not reported)") +
    "\n  files on disk     : " +
    Object.values(report?.published?.files || {})
        .filter(Boolean).length +
    " of " +
    Object.keys(report?.published?.files || {}).length
);

console.log(
    "\n-------------------------------------------\n" +
    "Passed: " + passed + "\n" +
    "Failed: " + failed + "\n"
);

process.exit(failed === 0 ? 0 : 1);
