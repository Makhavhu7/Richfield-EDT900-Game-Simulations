/**
 * Richfield EDT900 Game Simulations
 * ---------------------------------------------------------------
 * Server-side game catalogue and scoring rules for the three
 * Emerging & Disruptive Technology 900 simulations.
 *
 * The browser renders the games from the JSON files in assets/data,
 * but every submitted answer is re-scored here so the AfriCOIN stored
 * against a user account cannot be faked from the browser console.
 *
 * Simulation 0 - AI Detective (three-stage game)
 *   3 stages x 5 problems = 15 problems = 300 AfriCOIN
 *   Stage 1 ... 10 AfriCOIN per correct problem
 *   Stage 2 ... 20 AfriCOIN per correct problem
 *   Stage 3 ... 30 AfriCOIN per correct problem
 *
 * Simulation 1 - Gauteng Smart Supply Challenge
 *   3 levels x 3 problems = 9 problems = 180 AfriCOIN
 *   Level 1 ... 10 / Level 2 ... 20 / Level 3 ... 30 per problem
 *
 * Simulation 2 - Africa 2035 Boardroom Challenge
 *   3 levels x 3 problems = 9 problems = 180 AfriCOIN
 *   Level 1 ... 10 / Level 2 ... 20 / Level 3 ... 30 per problem
 *
 * Both published file shapes are supported:
 *   stages[]      - Simulation 0 (stages -> problems_list)
 *   levels_data[] - Simulations 1 and 2 (levels -> problems)
 */

export const SIM_ZERO_ID = "sim0";
export const SIM_ONE_ID = "sim1";
export const SIM_TWO_ID = "sim2";

export const GAME_IDS = [
    SIM_ZERO_ID,
    SIM_ONE_ID,
    SIM_TWO_ID
];

export const GAME_LABELS = {
    [SIM_ZERO_ID]: "Simulation 0",
    [SIM_ONE_ID]: "Simulation 1",
    [SIM_TWO_ID]: "Simulation 2"
};

function toNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
}

function text(value, fallback = "") {
    const cleaned = String(value ?? "").trim();

    return cleaned || fallback;
}

function toAnswer(value) {
    return text(value).toUpperCase();
}

function listFrom(value) {
    return Array.isArray(value)
        ? value.filter(item => text(item))
        : [];
}

function normaliseBadge(raw) {
    if (!raw || typeof raw !== "object") {
        return null;
    }

    return {
        name: text(raw.name, "Stage badge"),
        emoji: text(raw.emoji),
        tagline: text(raw.tagline),
        unlockCondition: text(raw.unlock_condition)
    };
}

/**
 * Turns the level / stage wrapper of one published file into the
 * common group shape the API and the admin views use.
 */
function buildGroup({
    key,
    order,
    name,
    emoji,
    difficulty,
    badge,
    focus,
    pointsPerQuestion,
    rawProblems,
    groupWord
}) {
    const problems = Array.isArray(rawProblems)
        ? rawProblems
        : [];

    const label = groupWord + " " + order;
    const fullLabel = name
        ? label + " · " + name
        : label;

    const questions = {};
    const questionIds = [];
    let maximum = 0;

    problems.forEach((problem, index) => {
        const id = text(
            problem.problem_id ?? problem.id,
            "Q" + (index + 1)
        );

        const points = toNumber(
            problem.reward_africoin ??
            problem.points ??
            pointsPerQuestion
        );

        const title = text(
            problem.title,
            "Problem " + id
        );

        questions[id] = {
            id,
            points,
            answer: toAnswer(problem.correct_answer),
            title,
            label: fullLabel + " · " + title,
            groupKey: key,
            groupLabel: fullLabel,
            groupName: name,
            groupOrder: order,

            section: listFrom(
                problem.section_focus
            ).join(", ")
        };

        questionIds.push(id);
        maximum += points;
    });

    return {
        key,
        order,
        label,
        name,
        emoji: text(emoji),
        difficulty: text(difficulty),
        badge: normaliseBadge(badge),
        focus: text(focus),
        pointsPerQuestion: toNumber(pointsPerQuestion),
        maximum,
        questionCount: questionIds.length,
        questionIds,
        questions
    };
}

/** Builds one of the three published simulations. */
function buildGame(id, source, {
    groupKey,
    groupField,
    groupWord,
    nameField
}) {
    if (!source || typeof source !== "object") {
        throw new Error(
            GAME_LABELS[id] + " data is missing or invalid."
        );
    }

    const rawGroups = source[groupField];

    if (!Array.isArray(rawGroups) || !rawGroups.length) {
        throw new Error(
            GAME_LABELS[id] +
            " data is missing its " +
            groupField +
            "."
        );
    }

    const progression = listFrom(
        source.game_rules?.progression ||
        source.game_rules?.difficulty_progression
    );

    const groups = rawGroups.map((group, index) => {
        return buildGroup({
            key: text(
                group[groupKey],
                "group-" + (index + 1)
            ),

            order: index + 1,
            name: text(group[nameField]),
            emoji: group.emoji,
            difficulty: group.difficulty,
            badge: group.badge,
            focus: progression[index] || "",

            pointsPerQuestion:
                group.africoin_per_problem ??
                group.africoin_per_correct_answer,

            rawProblems:
                group.problems_list ||
                group.problems,

            groupWord
        });
    });

    const questions = {};

    groups.forEach(group => {
        Object.entries(group.questions)
            .forEach(([questionId, question]) => {
                questions[questionId] = question;
            });
    });

    const maximum = groups.reduce(
        (total, group) => total + group.maximum,
        0
    );

    const questionCount = groups.reduce(
        (total, group) => total + group.questionCount,
        0
    );

    return {
        id,
        label: GAME_LABELS[id],
        title: text(source.title, GAME_LABELS[id]),
        subtitle: text(source.subtitle),
        module: text(source.module),
        simulationType: text(source.simulation_type),

        currency: text(
            source.scoring_currency ||
            source.game_currency,
            "AfriCOIN"
        ),

        maximum,
        questionCount,
        groupCount: groups.length,
        groups,
        questions,
        rules: source.game_rules || null,
        endGame: source.end_game || null
    };
}

/**
 * Builds the scoring catalogue from the three published simulation
 * files.
 *
 * @param {{ sim0: object, sim1: object, sim2: object }} data
 */
export function buildCatalog({ sim0, sim1, sim2 }) {
    const games = {
        [SIM_ZERO_ID]: buildGame(SIM_ZERO_ID, sim0, {
            groupKey: "stage_id",
            groupField: "stages",
            groupWord: "Stage",
            nameField: "stage_name"
        }),

        [SIM_ONE_ID]: buildGame(SIM_ONE_ID, sim1, {
            groupKey: "level_id",
            groupField: "levels_data",
            groupWord: "Level",
            nameField: "level_name"
        }),

        [SIM_TWO_ID]: buildGame(SIM_TWO_ID, sim2, {
            groupKey: "level_id",
            groupField: "levels_data",
            groupWord: "Level",
            nameField: "level_name"
        })
    };

    const maximumTotal = GAME_IDS.reduce(
        (total, gameId) => total + games[gameId].maximum,
        0
    );

    return {
        games,
        maximumTotal
    };
}

/** Scores one submitted answer for one of the three simulations. */
export function scoreSubmission(catalog, submission) {
    const gameId = text(submission?.gameId);
    const game = catalog?.games?.[gameId];

    if (!game) {
        return null;
    }

    const questionId = text(
        submission?.questionId ??
        submission?.scenarioId
    );

    const question = game.questions[questionId];

    if (!question) {
        return null;
    }

    const answer = toAnswer(submission?.answer);

    const correct =
        Boolean(question.answer) &&
        answer === question.answer;

    return {
        gameId,
        questionId,
        kind: "problem",
        maximum: question.points,

        points:
            correct
                ? question.points
                : 0,

        correct,
        answer,
        label: question.label,

        groupKey: question.groupKey,
        groupLabel: question.groupLabel
    };
}
