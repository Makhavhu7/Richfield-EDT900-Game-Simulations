/*--------------------------------------------------------------------------
  Richfield EDT900 Game Simulations
  Plug-and-play simulation swap.

    node scripts/swap-simulation.mjs <new-file.json> [sim0|sim1|sim2] [--push]
    node scripts/swap-simulation.mjs <file.json> --check

  Validates the new file, installs it under the name the site already
  loads, rebuilds the committed Vercel bundle and (with --push) commits and
  pushes so Vercel redeploys. Run `npm run test:live` afterwards.
--------------------------------------------------------------------------*/

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SLOTS = {
    sim0: {
        file: "assets/data/EDT900_Simulation_0_AI_Detective.json",
        group: "stages",
        hint: /detective|simulation_0|sim_0/i
    },
    sim1: {
        file:
            "assets/data/" +
            "EDT900_Major_Simulation_1_Gauteng_Smart_Supply.json",
        group: "levels_data",
        hint: /supply|gauteng|simulation_1|sim_1/i
    },
    sim2: {
        file:
            "assets/data/" +
            "EDT900_Major_Simulation_2_Africa_2035_Boardroom.json",
        group: "levels_data",
        hint: /boardroom|africa[-_ ]?2035|simulation_2|sim_2/i
    }
};

const ANSWER_KEYS = [
    "correct_answer",
    "correctAnswer",
    "answer",
    "answer_key",
    "correct"
];

function groupsOf(data) {
    for (const key of [
        "levels_data",
        "stages",
        "levels",
        "missions"
    ]) {
        if (Array.isArray(data[key])) {
            return { key, groups: data[key] };
        }
    }

    return { key: "", groups: [] };
}

function problemsOf(group) {
    for (const key of [
        "problems",
        "problems_list",
        "questions",
        "steps"
    ]) {
        if (Array.isArray(group[key])) {
            return group[key];
        }
    }

    return [];
}

function summarise(data) {
    const { key, groups } = groupsOf(data);
    const problems = groups.flatMap(problemsOf);

    const points = problems.reduce((total, problem) => {
        const value = Number(
            problem.points ??
            problem.reward_africoin ??
            problem.africoin ??
            0
        );

        return total + (Number.isFinite(value) ? value : 0);
    }, 0);

    const answers = problems.filter(problem =>
        ANSWER_KEYS.some(key => problem[key] !== undefined)
    ).length;

    return {
        groupKey: key,
        groups: groups.length,
        problems: problems.length,
        points,
        answers
    };
}


const args = process.argv.slice(2);
const source = args.find(argument => !argument.startsWith("-"));
const flagPush = args.includes("--push");
const flagCheck = args.includes("--check");

if (!source) {
    console.error(
        "\nUsage: node scripts/swap-simulation.mjs " +
        "<new-file.json> [sim0|sim1|sim2] [--push] [--check]\n"
    );

    process.exit(1);
}

if (!existsSync(source)) {
    console.error("\nThat file does not exist: " + source + "\n");
    process.exit(1);
}

let incoming;

try {
    incoming = JSON.parse(readFileSync(source, "utf8"));
} catch (error) {
    console.error(
        "\nThe new file is not valid JSON: " +
        error.message +
        "\n"
    );

    process.exit(1);
}

const wanted = args.find(argument => SLOTS[argument]);

const detected = Object.keys(SLOTS).find(gameId =>
    SLOTS[gameId].hint.test(
        String(incoming.simulation_id || "") +
        " " +
        String(incoming.title || "") +
        " " +
        source
    )
);

const slot = wanted || detected;

if (!slot) {
    console.error(
        "\nCould not tell which simulation this replaces. " +
        "Pass sim0, sim1 or sim2.\n"
    );

    process.exit(1);
}

const target = SLOTS[slot];
const table = target.file.split("/").pop();
const fresh = summarise(incoming);

const installed = existsSync(target.file)
    ? summarise(JSON.parse(readFileSync(target.file, "utf8")))
    : null;

console.log("\nSlot             : " + slot + "  (" + table + ")");

console.log(
    "Group field      : " +
    (fresh.groupKey || "MISSING") +
    (fresh.groupKey === target.group
        ? "  matches the page"
        : "  page expects \"" + target.group + "\"")
);

console.log("Groups           : " + fresh.groups);

console.log(
    "Problems         : " +
    fresh.problems +
    (installed ? "   (was " + installed.problems + ")" : "")
);

console.log(
    "AfriCOIN maximum : " +
    fresh.points +
    (installed ? "   (was " + installed.points + ")" : "")
);

console.log(
    "Answer keys      : " +
    fresh.answers +
    " of " +
    fresh.problems +
    " problems"
);

if (!fresh.problems || !fresh.groups) {
    console.error(
        "\nSTOP: no problems found. Expected " +
        "levels_data/stages with problems.\n"
    );

    process.exit(1);
}

if (flagCheck) {
    console.log("\nCheck only - nothing was written.\n");
    process.exit(0);
}

writeFileSync(
    target.file,
    JSON.stringify(incoming, null, 2) + "\n",
    "utf8"
);

console.log("\nInstalled into " + target.file);
console.log("The previous version stays in git history.");

execFileSync("node", ["scripts/build-vercel.mjs"], {
    stdio: "inherit"
});

if (flagPush) {
    execFileSync("git", ["add", "-A"], { stdio: "inherit" });

    execFileSync(
        "git",
        [
            "commit",
            "-q",
            "-m",
            "Swap " +
            slot +
            " questions: " +
            fresh.problems +
            " problems, " +
            fresh.points +
            " AfriCOIN"
        ],
        { stdio: "inherit" }
    );

    execFileSync("git", ["push"], { stdio: "inherit" });

    console.log(
        "\nPushed - Vercel needs about 2 minutes. " +
        "Then run: npm run test:live\n"
    );
} else {
    console.log(
        "\nNext: git add -A && git commit && " +
        "git push (Vercel needs about 2 minutes)\n"
    );
}
