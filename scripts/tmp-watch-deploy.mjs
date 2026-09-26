/* Temporary: poll the live deployment until the fix is published. */
const base = "https://richfield-game-simulation.vercel.app";

const deadline = Date.now() + 6 * 60 * 1000;

let attempt = 0;

async function probe() {
    attempt += 1;

    const css = await fetch(base + "/assets/css/style.css", {
        redirect: "manual"
    });

    const home = await fetch(base + "/");
    const html = await home.text();

    const footer =
        /Game Testing - GLA/.test(html) ? "new" : "old";

    console.log(
        "try " + attempt +
        " | css " + css.status +
        " " + (css.headers.get("content-type") || "").split(";")[0] +
        " | home " + home.status + " (" + footer + " build)" +
        " | size " + html.length
    );

    if (css.status === 200) {
        const text = await css.text();

        console.log(
            "  css body: " + text.replace(/\s+/g, " ").slice(0, 60)
        );

        for (const path of [
            "/game",
            "/login",
            "/register",
            "/admin",
            "/assets/js/quiz-games.js",
            "/assets/js/admin.js",
            "/assets/data/EDT900_Simulation_0_AI_Detective.json",
            "/api/health"
        ]) {
            const response = await fetch(base + path, {
                redirect: "manual"
            });

            console.log(
                "  " + path.padEnd(52) + response.status + " " +
                (response.headers.get("content-type") || "")
                    .split(";")[0]
            );
        }

        return true;
    }

    return false;
}

while (Date.now() < deadline) {
    try {
        if (await probe()) {
            console.log("\nthe fix is live");
            process.exit(0);
        }
    } catch (error) {
        console.log("try " + attempt + " failed: " + error.message);
    }

    await new Promise(resolve => setTimeout(resolve, 15000));
}

console.log("\nthe deployment did not update in time");
process.exit(1);
