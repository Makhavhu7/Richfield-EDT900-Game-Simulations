/**
 * Richfield EDT900 Game Simulations
 * ---------------------------------------------------------------
 * Plays all three simulations the way a browser does, without a
 * browser: a small DOM stand-in runs the real assets/js/quiz-games.js
 * against the real game.html markup and the real JSON files, checks
 * the hub, the welcome screens, every question, the detailed
 * feedback, the badges, the score bands and the replay flow.
 *
 *   node scripts/ui-check.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(
    fileURLToPath(new URL("..", import.meta.url))
);

const VOID_TAGS = new Set([
    "area", "base", "br", "col", "embed", "hr", "img",
    "input", "link", "meta", "source", "track", "wbr"
]);

class ClassList {
    constructor(element) {
        this.element = element;
    }

    get set() {
        return new Set(
            String(
                this.element.attributes.class || ""
            ).split(/\s+/).filter(Boolean)
        );
    }

    write(values) {
        this.element.attributes.class =
            [...values].join(" ");
    }

    add(...names) {
        const values = this.set;

        names.forEach(name => values.add(name));
        this.write(values);
    }

    remove(...names) {
        const values = this.set;

        names.forEach(name => values.delete(name));
        this.write(values);
    }

    contains(name) {
        return this.set.has(name);
    }
}

class FakeElement {
    constructor(tag) {
        this.tagName = String(tag || "div");
        this.attributes = {};
        this.children = [];
        this.parent = null;
        this.listeners = {};
        this.texts = [];
        this.classList = new ClassList(this);

        this.hidden = false;
        this.disabled = false;
        this.checked = false;
        this.value = "";
        this._innerHTML = "";
    }

    get id() {
        return this.attributes.id || "";
    }

    get className() {
        return this.attributes.class || "";
    }

    set className(value) {
        this.attributes.class = String(value || "");
    }

    get dataset() {
        const data = {};

        Object.entries(this.attributes).forEach(([key, value]) => {
            if (key.startsWith("data-")) {
                const name = key
                    .slice(5)
                    .replace(/-([a-z])/g, (all, letter) =>
                        letter.toUpperCase()
                    );

                data[name] = value;
            }
        });

        return data;
    }

    getAttribute(name) {
        const value = this.attributes[String(name)];

        return value === undefined ? null : value;
    }

    setAttribute(name, value) {
        this.attributes[String(name)] = String(value);
    }

    appendChild(child) {
        child.parent = this;
        this.children.push(child);

        return child;
    }

    appendText(text) {
        this.texts.push(text);
    }

    get innerHTML() {
        return this._innerHTML;
    }

    set innerHTML(html) {
        this._innerHTML = String(html);
        this.children = [];
        this.texts = [];

        parseInto(this, this._innerHTML);
    }

    get textContent() {
        return (
            this.texts.join(" ") +
            " " +
            this.children
                .map(child => child.textContent)
                .join(" ")
        )
            .replace(/\s+/g, " ")
            .trim();
    }

    set textContent(value) {
        this.texts = [String(value ?? "")];
        this.children = [];
        this._innerHTML = "";
    }

    addEventListener(type, handler) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(handler);
    }

    click() {
        this.dispatchEvent({ type: "click", target: this });
    }

    dispatchEvent(event) {
        const handlers = this.listeners[event.type] || [];

        handlers.forEach(handler => handler(event));
    }

    scrollIntoView() {
        /* no layout in the harness */
    }

    descendants() {
        const all = [];

        (function walk(node) {
            node.children.forEach(child => {
                all.push(child);
                walk(child);
            });
        })(this);

        return all;
    }

    querySelectorAll(selector) {
        return selectAll(this, selector);
    }

    querySelector(selector) {
        return selectAll(this, selector)[0] || null;
    }
}

function parseAttributes(text) {
    const attributes = [];

    const pattern =
        /([a-zA-Z0-9_:@.-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

    let match = pattern.exec(text);

    while (match) {
        const value =
            match[3] ?? match[4] ?? match[5] ?? "";

        attributes.push([match[1].toLowerCase(), value]);
        match = pattern.exec(text);
    }

    return attributes;
}

function parseInto(parent, html) {
    const pattern =
        /<(\/?)([a-zA-Z0-9-]+)((?:\s+[^>]*?)?)(\/?)>/g;

    const stack = [parent];
    let lastIndex = 0;
    let match = pattern.exec(html);

    while (match) {
        const text = html.slice(lastIndex, match.index);

        if (text.trim()) {
            stack[stack.length - 1].appendText(text);
        }

        lastIndex = pattern.lastIndex;

        const closing = match[1] === "/";
        const tag = match[2].toLowerCase();
        const attributeText = match[3] || "";
        const selfClosing = match[4] === "/";

        if (closing) {
            for (let index = stack.length - 1; index > 0; index -= 1) {
                if (stack[index].tagName.toLowerCase() === tag) {
                    stack.length = index;
                    break;
                }
            }
        } else {
            const element = new FakeElement(tag);

            parseAttributes(attributeText)
                .forEach(([name, value]) => {
                    element.setAttribute(name, value);
                });

            // Real browsers reflect these attributes onto the properties.
            if (element.attributes.disabled !== undefined) {
                element.disabled = true;
            }

            if (element.attributes.hidden !== undefined) {
                element.hidden = true;
            }

            if (element.attributes.checked !== undefined) {
                element.checked = true;
            }

            if (element.attributes.value !== undefined) {
                element.value = element.attributes.value;
            }

            stack[stack.length - 1].appendChild(element);

            if (!selfClosing && !VOID_TAGS.has(tag)) {
                stack.push(element);
            }
        }

        match = pattern.exec(html);
    }

    const tail = html.slice(lastIndex);

    if (tail.trim()) {
        stack[stack.length - 1].appendText(tail);
    }
}

function parseCompound(part) {
    const info = {
        tag: null,
        id: null,
        classes: [],
        attrs: [],
        checked: false
    };

    let text = String(part);

    if (text.endsWith(":checked")) {
        info.checked = true;
        text = text.slice(0, -":checked".length);
    }

    text = text.replace(/\[([^\]]*)\]/g, (all, inner) => {
        const equals = inner.indexOf("=");

        if (equals < 0) {
            info.attrs.push([inner.trim().toLowerCase(), null]);
            return "";
        }

        const name = inner.slice(0, equals).trim().toLowerCase();

        let value = inner.slice(equals + 1).trim();

        if (
            (value.startsWith("\"") && value.endsWith("\"")) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        info.attrs.push([name, value]);

        return "";
    });

    text = text.replace(/#([A-Za-z0-9_-]+)/g, (all, id) => {
        info.id = id;
        return "";
    });

    text = text.replace(/\.([A-Za-z0-9_-]+)/g, (all, name) => {
        info.classes.push(name);
        return "";
    });

    const tag = text.trim();

    if (tag) {
        info.tag = tag.toLowerCase();
    }

    return info;
}

function matchesCompound(element, info) {
    if (
        info.tag &&
        element.tagName.toLowerCase() !== info.tag
    ) {
        return false;
    }

    if (info.id && element.id !== info.id) {
        return false;
    }

    if (
        info.classes.some(
            name => !element.classList.contains(name)
        )
    ) {
        return false;
    }

    for (const [name, value] of info.attrs) {
        const actual = element.getAttribute(name);

        if (actual === null) {
            return false;
        }

        if (value !== null && actual !== value) {
            return false;
        }
    }

    if (info.checked && !element.checked) {
        return false;
    }

    return true;
}

function selectAll(root, selector) {
    const parts = String(selector || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    let current = [root];

    parts.forEach(part => {
        const info = parseCompound(part);
        const next = [];

        current.forEach(base => {
            base.descendants().forEach(element => {
                if (
                    matchesCompound(element, info) &&
                    !next.includes(element)
                ) {
                    next.push(element);
                }
            });
        });

        current = next;
    });

    return current;
}

class FakeDocument {
    constructor(baseUri) {
        this.baseURI = baseUri;
        this.root = new FakeElement("#document");
        this.listeners = {};
        this.readyState = "loading";
    }

    createElement(tag) {
        return new FakeElement(tag);
    }

    get body() {
        return this.root;
    }

    addEventListener(type, handler) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(handler);
    }

    dispatchEvent(event) {
        (this.listeners[event.type] || [])
            .forEach(handler => handler(event));
    }

    getElementById(id) {
        return selectAll(this.root, "#" + id)[0] || null;
    }

    querySelector(selector) {
        return selectAll(this.root, selector)[0] || null;
    }

    querySelectorAll(selector) {
        return selectAll(this.root, selector);
    }
}

/* ------------------------------ environment ------------------------------ */

const pageHtml = fs.readFileSync(
    path.join(root, "game.html"),
    "utf8"
);

const document = new FakeDocument(
    pathToFileURL(root + path.sep).href
);

parseInto(document.root, pageHtml);

class FakeEvent {
    constructor(type) {
        this.type = type;
        this.target = null;
    }

    preventDefault() {
        /* nothing to do */
    }
}

const gameFiles = {
    sim0: "assets/data/EDT900_Simulation_0_AI_Detective.json",

    sim1: "assets/data/" +
        "EDT900_Major_Simulation_1_Gauteng_Smart_Supply.json",

    sim2: "assets/data/" +
        "EDT900_Major_Simulation_2_Africa_2035_Boardroom.json"
};

const answerKey = {};
const pointsKey = {};
const maximumByGame = {};

Object.entries(gameFiles).forEach(([id, file]) => {
    const data = JSON.parse(
        fs.readFileSync(path.join(root, file), "utf8")
    );

    const groups = data.stages || data.levels_data;
    let maximum = 0;

    groups.forEach(group => {
        (group.problems_list || group.problems)
            .forEach(problem => {
                answerKey[problem.problem_id] =
                    String(problem.correct_answer)
                        .trim()
                        .toUpperCase();

                pointsKey[problem.problem_id] =
                    Number(problem.reward_africoin);

                maximum += Number(problem.reward_africoin);
            });
    });

    maximumByGame[id] = maximum;
});

const submissions = [];
const chips = [];

const fetchCalls = [];

globalThis.fetch = async url => {
    const href = String(url);

    fetchCalls.push(href);

    const filePath = fileURLToPath(href);

    if (!fs.existsSync(filePath)) {
        return {
            ok: false,
            status: 404,
            text: async () => ""
        };
    }

    const text = fs.readFileSync(filePath, "utf8");

    return {
        ok: true,
        status: 200,
        text: async () => text,
        json: async () => JSON.parse(text)
    };
};

const fakeUser = () => ({
    fullName: "DOM Check Player",

    points: {
        total: submissions.reduce(
            (sum, entry) => sum + entry.awarded,
            0
        ),

        maximum: 660,
        games: {}
    }
});

globalThis.window = globalThis;
globalThis.document = document;
globalThis.Event = FakeEvent;
globalThis.GameApi = null;

window.GameApi = {
    async submit(payload) {
        submissions.push(payload);

        const correct =
            payload.answer === answerKey[payload.questionId];

        const points = correct
            ? pointsKey[payload.questionId] || 0
            : 0;

        return {
            status: 200,
            ok: true,

            data: {
                ok: true,
                awarded: points,
                correct,
                maximum: pointsKey[payload.questionId],
                gameId: payload.gameId,
                questionId: payload.questionId,

                record: {
                    points,
                    lastPoints: points,
                    plays: 1,
                    correct,
                    correctEver: correct
                },

                user: fakeUser()
            }
        };
    },

    renderSession(user) {
        chips.push(user);
    }
};

const quizSource = fs.readFileSync(
    path.join(root, "assets", "js", "quiz-games.js"),
    "utf8"
);

vm.runInThisContext(quizSource, {
    filename: "assets/js/quiz-games.js"
});

/* --------------------------------- runner -------------------------------- */

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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(test, label, timeout) {
    const deadline = Date.now() + (timeout || 5000);

    for (;;) {
        let value = null;

        try {
            value = test();
        } catch (error) {
            value = null;
        }

        if (value) {
            return value;
        }

        if (Date.now() > deadline) {
            throw new Error("timeout waiting for " + label);
        }

        await sleep(20);
    }
}

async function playGame(prefix, options) {
    const settings = options || {};

    const hubButtonIds = {
        sim0: "openSim0Game",
        sim1: "openSim1Game",
        sim2: "openSim2Game"
    };

    const hubButton = await waitFor(
        () => {
            const button = document.getElementById(
                hubButtonIds[prefix]
            );

            return button && !button.disabled ? button : null;
        },
        "the " + prefix + " hub button"
    );

    hubButton.click();
    await sleep(20);

    const welcome = document.getElementById(prefix + "GameMount");
    const start = await waitFor(
        () => document.getElementById(prefix + "Start"),
        prefix + " start button"
    );

    const welcomeText = welcome.textContent;

    start.click();
    await sleep(20);

    let answered = 0;
    let sawIncorrect = 0;
    let sawCorrect = 0;
    let wrongDone = false;

    for (let guard = 0; guard < 40; guard += 1) {
        const radios = document.querySelectorAll(
            "#" + prefix + "Options input[type=\"radio\"]"
        );

        if (!radios.length) {
            break;
        }

        const problemId = radios[0]
            .getAttribute("name")
            .slice(prefix.length + 1);

        const answer = answerKey[problemId];
        const wantWrong =
            settings.wrongOn === answered && !wrongDone;

        wrongDone = wrongDone || wantWrong;

        const target = radios.find(radio =>
            wantWrong
                ? radio.value !== answer
                : radio.value === answer
        );

        target.checked = true;
        target.dispatchEvent(new FakeEvent("change"));
        await sleep(10);

        document.getElementById(prefix + "Submit").click();
        answered += 1;

        const feedback = await waitFor(() => {
            const panel = document.getElementById(prefix + "Feedback");

            return panel && !panel.hidden ? panel : null;
        }, prefix + " feedback for " + problemId);

        const status = feedback.querySelector(
            ".game-feedback-status"
        );

        if (status.textContent.startsWith("Correct")) {
            sawCorrect += 1;
        } else {
            sawIncorrect += 1;
        }

        if (
            settings.wrongOn === answered - 1 &&
            !feedback.textContent.includes("Best answer")
        ) {
            throw new Error(
                "the incorrect feedback did not show the best answer"
            );
        }

        await sleep(10);

        const next = document.getElementById(prefix + "Next");

        if (next && !next.hidden) {
            next.click();
            await sleep(10);
        } else {
            break;
        }
    }

    const results = await waitFor(() => {
        const mount = document.getElementById(prefix + "GameMount");

        return mount && mount.querySelector(".game-results");
    }, prefix + " results");

    return {
        answered,
        sawCorrect,
        sawIncorrect,
        welcomeText,
        results,

        score: results
            .querySelector(".game-final-score strong")
            .textContent.trim(),

        band: results.querySelector(".game-result-band")
            ? results.querySelector(".game-result-band")
                .textContent.trim()
            : ""
    };
}

/* ---------------------------------- main --------------------------------- */

console.log(
    "\nRichfield EDT900 - DOM game engine check\n" +
    "=========================================\n"
);

document.dispatchEvent(new FakeEvent("DOMContentLoaded"));

(async () => {
    try {
        const hubButton = await waitFor(
            () => {
                const button = document.getElementById("openSim0Game");

                return button && !button.disabled ? button : null;
            },
            "the simulation hub"
        );

        check("The hub enabled the Simulation 0 button", Boolean(hubButton));

        const expected = {};

        Object.entries(gameFiles).forEach(([id, file]) => {
            const data = JSON.parse(
                fs.readFileSync(path.join(root, file), "utf8")
            );

            const groups = data.stages || data.levels_data;

            const problems = groups.flatMap(
                group => group.problems_list || group.problems
            );

            expected[id] = {
                count: problems.length,

                maximum: problems.reduce(
                    (sum, problem) =>
                        sum + Number(problem.reward_africoin),
                    0
                )
            };
        });

        ["sim0", "sim1", "sim2"].forEach(id => {
            check(
                "The " + id + " hub card shows the real count and maximum",
                document
                    .getElementById(id + "CardQuestions")
                    .textContent.trim() ===
                    String(expected[id].count) &&

                document
                    .getElementById(id + "CardScore")
                    .textContent.trim() ===
                    String(expected[id].maximum)
            );

            check(
                "The " + id + " load status describes the loaded content",
                document
                    .getElementById(id + "LoadStatus")
                    .textContent.includes("AfriCOIN available"),

                document
                    .getElementById(id + "LoadStatus")
                    .textContent
            );
        });

        const sim1Hub = await waitFor(
            () => {
                const button = document.getElementById("openSim1Game");

                return button && !button.disabled ? button : null;
            },
            "the Simulation 1 hub button"
        );

        sim1Hub.click();
        await sleep(40);

        const welcome = document
            .getElementById("sim1GameMount")
            .textContent;

        check(
            "The welcome screen explains how the simulation works",
            welcome.includes("How the simulation works")
        );

        check(
            "The welcome screen lists the badges to unlock",
            welcome.includes("Badges to unlock")
        );

        const sim0 = await playGame("sim0", { wrongOn: 1 });

        check(
            "Simulation 0 answered all 15 problems",
            sim0.answered === 15,
            String(sim0.answered)
        );

        check(
            "Simulation 0 showed 14 correct and 1 incorrect feedback panel",
            sim0.sawCorrect === 14 && sim0.sawIncorrect === 1,
            JSON.stringify({
                correct: sim0.sawCorrect,
                incorrect: sim0.sawIncorrect
            })
        );

        check(
            "Simulation 0 scores 290 of 300 with one wrong 10 AfriCOIN answer",
            sim0.score === "290",
            sim0.score
        );

        check(
            "Simulation 0 shows the published score band",
            sim0.band.length > 3,
            sim0.band
        );

        check(
            "Simulation 0 unlocked its stage badges",
            sim0.results.textContent.includes("unlocked")
        );

        check(
            "The Simulation 0 results screen offers a replay",
            Boolean(document.getElementById("sim0Restart"))
        );

        const sim1 = await playGame("sim1");

        check(
            "Simulation 1 answered all 9 problems",
            sim1.answered === 9,
            String(sim1.answered)
        );

        check(
            "Simulation 1 reaches the full 180 AfriCOIN",
            sim1.score === "180",
            sim1.score
        );

        const sim2 = await playGame("sim2");

        check(
            "Simulation 2 answered all 9 problems",
            sim2.answered === 9,
            String(sim2.answered)
        );

        check(
            "Simulation 2 reaches the full 180 AfriCOIN",
            sim2.score === "180",
            sim2.score
        );

        check(
            "Every answer was submitted with its simulation id",
            submissions.length === 33 &&
            submissions.every(entry =>
                ["sim0", "sim1", "sim2"].includes(entry.gameId)
            ),
            String(submissions.length)
        );

        check(
            "The account chip was refreshed after every answer",
            chips.length === submissions.length,
            chips.length + " vs " + submissions.length
        );

        check(
            "The page fetched all three simulation files",
            fetchCalls.filter(url => url.includes("EDT900_")).length === 3,
            String(fetchCalls.length)
        );

        document.getElementById("sim2Restart").click();
        await sleep(40);

        check(
            "The replay button starts the simulation again",
            Boolean(document.getElementById("sim2Options"))
        );
    } catch (error) {
        failed += 1;

        console.log("  FAIL  the play-through crashed: " + error.message);
        console.log(error.stack);
    }

    console.log(
        "\n----------------------------------\n" +
        "Passed: " + passed + "\n" +
        "Failed: " + failed + "\n"
    );

    process.exit(failed ? 1 : 0);
})();
