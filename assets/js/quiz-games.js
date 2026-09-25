/**
 * Richfield EDT900 Game Simulations
 * ---------------------------------------------------------------
 * The games page (game.html) renders the three Emerging &
 * Disruptive Technology 900 simulations from the JSON files in
 * assets/data:
 *
 *   Simulation 0 - AI Detective (three-stage game)
 *   Simulation 1 - Gauteng Smart Supply Challenge
 *   Simulation 2 - Africa 2035 Boardroom Challenge
 *
 * Every answer is scored again on the server (lib/game-catalog.mjs),
 * so the AfriCOIN saved against an account cannot be faked from the
 * browser console.
 */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const SIMULATIONS = [
        {
            id: "sim0",
            label: "Simulation 0",
            file:
                "assets/data/" +
                "EDT900_Simulation_0_AI_Detective.json",

            groupField: "stages",
            groupKeyField: "stage_id",
            groupNameField: "stage_name",
            groupWord: "Stage",
            icon: "bi-search",

            buttonId: "openSim0Game",
            statusId: "sim0LoadStatus",
            sectionId: "sim0GameSection",
            mountId: "sim0GameMount",
            questionsId: "sim0CardQuestions",
            scoreId: "sim0CardScore",

            nextId: "sim1"
        },
        {
            id: "sim1",
            label: "Simulation 1",
            file:
                "assets/data/" +
                "EDT900_Major_Simulation_1_Gauteng_Smart_Supply.json",

            groupField: "levels_data",
            groupKeyField: "level_id",
            groupNameField: "level_name",
            groupWord: "Level",
            icon: "bi-truck",

            buttonId: "openSim1Game",
            statusId: "sim1LoadStatus",
            sectionId: "sim1GameSection",
            mountId: "sim1GameMount",
            questionsId: "sim1CardQuestions",
            scoreId: "sim1CardScore",

            nextId: "sim2"
        },
        {
            id: "sim2",
            label: "Simulation 2",
            file:
                "assets/data/" +
                "EDT900_Major_Simulation_2_Africa_2035_Boardroom.json",

            groupField: "levels_data",
            groupKeyField: "level_id",
            groupNameField: "level_name",
            groupWord: "Level",
            icon: "bi-globe-africa",

            buttonId: "openSim2Game",
            statusId: "sim2LoadStatus",
            sectionId: "sim2GameSection",
            mountId: "sim2GameMount",
            questionsId: "sim2CardQuestions",
            scoreId: "sim2CardScore",

            nextId: null
        }
    ];

    const toast = {
        element: document.getElementById("gameScoreToast"),
        heading: document.getElementById("gameScoreToastHeading"),
        copy: document.getElementById("gameScoreToastCopy")
    };

    let toastTimer = null;

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function cleanText(value, fallback = "") {
        const cleaned = String(value ?? "").trim();

        return cleaned || fallback;
    }

    function toNumber(value, fallback = 0) {
        const number = Number(value);

        return Number.isFinite(number)
            ? number
            : fallback;
    }

    function showToast(heading, copy, type = "correct") {
        window.clearTimeout(toastTimer);

        toast.element.className =
            "game-score-toast " + type;

        toast.heading.textContent = heading;
        toast.copy.textContent = copy;

        toast.element.hidden = false;

        toastTimer = window.setTimeout(() => {
            toast.element.hidden = true;
        }, 2400);
    }

    async function fetchJson(url) {
        const response = await fetch(url, {
            method: "GET",

            headers: {
                Accept: "application/json"
            },

            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(
                `File not found. Status code: ${response.status}.`
            );
        }

        const text = await response.text();

        if (!text.trim()) {
            throw new Error("The JSON file is empty.");
        }

        try {
            return JSON.parse(
                text.replace(/^\uFEFF/, "")
            );
        } catch (error) {
            console.error("Invalid JSON:", error);

            throw new Error(
                "The file was found, but it does not contain valid JSON."
            );
        }
    }

    /** Options may come as {"A": "text"} or [{id, text}]. */
    function optionsFrom(raw) {
        if (Array.isArray(raw)) {
            return raw
                .map((option, index) => ({
                    key: cleanText(
                        option?.id ?? option?.key,
                        String.fromCharCode(65 + index)
                    ).toUpperCase(),

                    text: cleanText(
                        option?.text ?? option?.label ?? option
                    )
                }))
                .filter(option => option.text);
        }

        if (raw && typeof raw === "object") {
            return Object.entries(raw)
                .map(([key, value]) => ({
                    key: String(key).toUpperCase(),
                    text: cleanText(value)
                }))
                .filter(option => option.text);
        }

        return [];
    }

    /** "At least 4 correct answers out of 5" -> 4 */
    function parseThreshold(condition, total) {
        const match = String(condition || "")
            .match(/\d+/);

        if (match) {
            return toNumber(match[0], Math.ceil(total / 2));
        }

        return Math.max(1, Math.ceil(total / 2));
    }

    function normaliseBadge(raw, total) {
        if (!raw || typeof raw !== "object") {
            return null;
        }

        const unlockCondition = cleanText(
            raw.unlock_condition
        );

        return {
            name: cleanText(raw.name, "Badge"),
            emoji: cleanText(raw.emoji, "🏅"),
            tagline: cleanText(raw.tagline),
            unlockCondition,
            threshold: parseThreshold(unlockCondition, total)
        };
    }

    function sdgText(problem) {
        if (problem.sdg && typeof problem.sdg === "object") {
            const primary = cleanText(problem.sdg.primary);
            const name = cleanText(problem.sdg.name);
            const secondary = cleanText(problem.sdg.secondary);

            return [
                primary + (name ? " · " + name : ""),
                secondary ? "Secondary: " + secondary : ""
            ]
                .filter(Boolean)
                .join(" · ");
        }

        return cleanText(problem.sdg_link);
    }

    function characterText(character) {
        if (!character) {
            return "";
        }

        if (typeof character === "string") {
            return cleanText(character);
        }

        return [
            cleanText(character.name),
            cleanText(character.role),
            cleanText(character.organisation)
        ]
            .filter(Boolean)
            .join(" · ");
    }

    function plotTwistOf(problem) {
        const twist = problem.plot_twist;

        if (!twist || typeof twist !== "object") {
            return null;
        }

        return {
            scenario: cleanText(twist.scenario),
            question: cleanText(twist.question),

            answer: cleanText(
                twist.answer_text,
                cleanText(twist.correct_answer)
            )
        };
    }

    function normaliseQuestion(problem, group, index) {
        const id = cleanText(
            problem.problem_id ?? problem.id,
            group.key + "-Q" + (index + 1)
        );

        return {
            id,
            title: cleanText(problem.title, "Problem " + id),
            location: cleanText(problem.location),
            character: characterText(problem.character),
            scenario: cleanText(problem.scenario),
            question: cleanText(problem.question),
            options: optionsFrom(problem.options),

            answer: cleanText(problem.correct_answer)
                .toUpperCase(),

            points: toNumber(
                problem.reward_africoin ??
                problem.points ??
                group.pointsPerQuestion
            ),

            feedback:
                problem.feedback ||
                problem.detailed_feedback ||
                {},

            teachingPoint: cleanText(problem.teaching_point),
            ethicsFlash: cleanText(problem.ethics_flash),
            facilitatorTip: cleanText(problem.facilitator_tip),
            funLine: cleanText(problem.fun_line),
            sdg: sdgText(problem),
            section: Array.isArray(problem.section_focus)
                ? problem.section_focus.join(", ")
                : cleanText(problem.section_focus),

            plotTwist: plotTwistOf(problem),
            group
        };
    }

    function normaliseGroup(config, rawGroup, index, progression) {
        const order = index + 1;

        const key = cleanText(
            rawGroup[config.groupKeyField],
            config.groupWord + "-" + order
        );

        const name = cleanText(rawGroup[config.groupNameField]);
        const label = config.groupWord + " " + order;

        const group = {
            key,
            order,
            label,

            fullLabel: name
                ? label + " · " + name
                : label,

            name,
            emoji: cleanText(rawGroup.emoji),
            difficulty: cleanText(rawGroup.difficulty),
            focus: cleanText(progression[index]),
            badge: null,
            pointsPerQuestion: toNumber(
                rawGroup.africoin_per_problem ??
                rawGroup.africoin_per_correct_answer
            ),
            maximum: 0,
            questions: []
        };

        group.badge = normaliseBadge(
            rawGroup.badge,
            Math.max(
                1,
                (
                    rawGroup.problems_list ||
                    rawGroup.problems ||
                    []
                ).length
            )
        );

        group.questions = (
            rawGroup.problems_list ||
            rawGroup.problems ||
            []
        ).map((problem, problemIndex) =>
            normaliseQuestion(problem, group, problemIndex)
        );

        group.maximum = group.questions.reduce(
            (total, question) => total + question.points,
            0
        );

        return group;
    }

    function normaliseGame(config, source) {
        const rawGroups = Array.isArray(source[config.groupField])
            ? source[config.groupField]
            : [];

        if (!rawGroups.length) {
            throw new Error(
                "The " +
                config.groupField +
                " list is missing from " +
                config.file
            );
        }

        const progression = [
            ...(Array.isArray(source.game_rules?.progression)
                ? source.game_rules.progression
                : []),

            ...(Array.isArray(
                source.game_rules?.difficulty_progression
            )
                ? source.game_rules.difficulty_progression
                : [])
        ];

        const groups = rawGroups.map((rawGroup, index) =>
            normaliseGroup(
                config,
                rawGroup,
                index,
                progression
            )
        );

        const questions = groups.flatMap(
            group => group.questions
        );

        return {
            id: config.id,
            config,
            title: cleanText(source.title, config.id),
            subtitle: cleanText(source.subtitle),
            module: cleanText(
                source.module,
                "Emerging & Disruptive Technology 900"
            ),
            currency: cleanText(
                source.scoring_currency ||
                source.game_currency,
                "AfriCOIN"
            ),
            groups,
            questions,
            maximum: groups.reduce(
                (total, group) => total + group.maximum,
                0
            ),
            questionCount: questions.length,
            rules: source.game_rules || null,
            endGame: source.end_game || null
        };
    }

    /** Creates the DOM handles and the play state for one game. */
    function createPlayer(config) {
        return {
            config,

            button: document.getElementById(config.buttonId),
            status: document.getElementById(config.statusId),
            section: document.getElementById(config.sectionId),
            mount: document.getElementById(config.mountId),
            cardQuestions:
                document.getElementById(config.questionsId),
            cardScore: document.getElementById(config.scoreId),

            game: null,
            started: false,

            state: {
                index: 0,
                score: 0,
                correct: 0,
                submitted: false,
                groups: {}
            },

            resetState() {
                this.state = {
                    index: 0,
                    score: 0,
                    correct: 0,
                    submitted: false,

                    groups: Object.fromEntries(
                        this.game.groups.map(group => [
                            group.key,
                            {
                                correct: 0,
                                score: 0,
                                maximum: group.maximum,
                                total: group.questions.length
                            }
                        ])
                    )
                };
            }
        };
    }

    function badgeCards(game) {
        return game.groups
            .map(group => `
                <div class="col-md-4">
                    <article class="game-result-mini-card">
                        <span>
                            ${escapeHtml(group.label)}
                        </span>

                        <h3>
                            ${escapeHtml(
                                group.badge
                                    ? group.badge.emoji +
                                      " " +
                                      group.badge.name
                                    : group.name || group.fullLabel
                            )}
                        </h3>

                        <strong>
                            ${group.pointsPerQuestion}
                            ${escapeHtml(game.currency)} per problem
                        </strong>

                        <p>
                            ${escapeHtml(
                                group.badge
                                    ? group.badge.unlockCondition
                                    : group.focus
                            )}
                        </p>
                    </article>
                </div>
            `)
            .join("");
    }

    function renderWelcome(player) {
        const game = player.game;

        const heading =
            game.rules?.objective ||
            game.subtitle ||
            "Work through every problem and collect AfriCOIN.";

        const howItWorks = game.groups
            .slice(0, 3)
            .map(group => `
                <li>
                    ${escapeHtml(group.label)} problems are worth
                    <strong>${group.pointsPerQuestion}
                    ${escapeHtml(game.currency)}</strong> each
                    (${group.maximum} ${escapeHtml(game.currency)} for
                    ${escapeHtml(group.name || group.fullLabel)}).
                </li>
            `)
            .join("");

        player.mount.innerHTML = `
            <section class="game-card game-welcome">
                <div class="game-large-icon">
                    ${escapeHtml(
                        game.groups[0]?.emoji || "🎮"
                    )}
                </div>

                <span class="game-eyebrow">
                    ${escapeHtml(game.config.label)}
                </span>

                <h2>
                    ${escapeHtml(game.title)}
                </h2>

                <p class="game-subtitle">
                    ${escapeHtml(game.subtitle)}
                </p>

                <p>
                    ${escapeHtml(heading)}
                </p>

                <div class="game-stat-grid three">
                    <article>
                        <strong>
                            ${game.questionCount}
                        </strong>

                        <span>
                            Problems
                        </span>
                    </article>

                    <article>
                        <strong>
                            ${game.groups.length}
                        </strong>

                        <span>
                            ${escapeHtml(
                                game.config.groupWord + "s"
                            )}
                        </span>
                    </article>

                    <article>
                        <strong>
                            ${game.maximum}
                        </strong>

                        <span>
                            ${escapeHtml(
                                game.currency + " available"
                            )}
                        </span>
                    </article>
                </div>

                <div class="game-instructions">
                    <h3>
                        How the simulation works
                    </h3>

                    <ul>
                        <li>
                            Answer one problem at a time with the
                            single best option.
                        </li>

                        ${howItWorks}

                        <li>
                            Every answer gives immediate, detailed
                            feedback, so you learn while you play.
                        </li>

                        <li>
                            Your best score per problem is kept on your
                            account, so you can replay the simulation.
                        </li>
                    </ul>
                </div>

                <div class="game-result-section">
                    <h3>
                        Badges to unlock
                    </h3>

                    <div class="row g-4">
                        ${badgeCards(game)}
                    </div>
                </div>

                <button
                    id="${player.config.id}Start"
                    class="btn btn-gsb-primary btn-lg"
                    type="button"
                >
                    Begin ${escapeHtml(game.config.label)}

                    <i class="bi bi-arrow-right" aria-hidden="true"></i>
                </button>
            </section>
        `;

        player.mount
            .querySelector("#" + player.config.id + "Start")
            .addEventListener("click", () => startGame(player));
    }

    function openGame(player) {
        if (!player.game) {
            // The simulation file has not arrived yet; the hub button stays
            // disabled until it has, so this only guards a programmatic click.
            return;
        }

        players.forEach(other => {
            other.section.hidden = other !== player;
        });

        if (!player.started) {
            renderWelcome(player);
        }

        window.setTimeout(() => {
            player.section.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }, 50);
    }

    function startGame(player) {
        player.resetState();
        player.started = true;
        renderQuestion(player);
    }

    function currentQuestion(player) {
        return player.game.questions[player.state.index];
    }

    function renderQuestion(player) {
        const question = currentQuestion(player);

        if (!question) {
            renderResults(player);
            return;
        }

        const game = player.game;
        const group = question.group;
        const prefix = player.config.id;

        player.state.submitted = false;

        const total = game.questionCount;
        const position = player.state.index + 1;

        const progress = Math.round(
            ((position - 1) / total) * 100
        );

        const details = [
            question.location
                ? `
                    <div class="scenario-detail-row">
                        <i class="bi bi-geo-alt" aria-hidden="true"></i>
                        <span>${escapeHtml(question.location)}</span>
                    </div>
                `
                : "",

            question.character
                ? `
                    <div class="scenario-detail-row">
                        <i class="bi bi-person-badge" aria-hidden="true"></i>
                        <span>${escapeHtml(question.character)}</span>
                    </div>
                `
                : "",

            question.section
                ? `
                    <div class="scenario-detail-row">
                        <i class="bi bi-journal-text" aria-hidden="true"></i>
                        <span>${escapeHtml(question.section)}</span>
                    </div>
                `
                : ""
        ].join("");

        const options = question.options
            .map(option => `
                <div class="game-choice-wrapper">
                    <input
                        id="${prefix}-${escapeHtml(question.id)}-${option.key}"
                        type="radio"
                        name="${prefix}-${escapeHtml(question.id)}"
                        value="${option.key}"
                    >

                    <label
                        class="game-choice"
                        for="${prefix}-${escapeHtml(question.id)}-${option.key}"
                        data-letter="${option.key}"
                    >
                        <span class="game-choice-letter">
                            ${option.key}
                        </span>

                        <span>
                            ${escapeHtml(option.text)}
                        </span>
                    </label>
                </div>
            `)
            .join("");

        player.mount.innerHTML = `
            <div class="game-scorebar">
                <div>
                    <span>
                        Current ${escapeHtml(game.currency)}
                    </span>

                    <strong id="${prefix}Scorebar">
                        ${player.state.score}/${game.maximum}
                    </strong>
                </div>

                <div class="game-scorebar-right">
                    <span>
                        Problem ${position} of ${total}
                    </span>

                    <strong>
                        ${progress}%
                    </strong>
                </div>
            </div>

            <div class="game-progress-track">
                <span
                    class="game-progress-fill"
                    style="width: ${progress}%"
                ></span>
            </div>

            <article class="game-card game-question-card">
                <div class="game-question-meta">
                    <div>
                        <span class="game-badge navy">
                            ${escapeHtml(group.label)}
                        </span>

                        <span class="game-badge cyan">
                            ${escapeHtml(group.difficulty)}
                        </span>
                    </div>

                    <strong>
                        ${question.points}
                        ${escapeHtml(game.currency)}
                    </strong>
                </div>

                <div class="game-level-context">
                    <strong>
                        ${escapeHtml(group.name || group.fullLabel)}
                    </strong>

                    <p>
                        ${escapeHtml(group.focus)}
                    </p>
                </div>

                <h2>
                    ${escapeHtml(question.title)}
                </h2>

                ${details}

                <div class="game-scenario-box">
                    <span>
                        Scenario
                    </span>

                    <p>
                        ${escapeHtml(question.scenario)}
                    </p>
                </div>

                <fieldset>
                    <legend>
                        ${escapeHtml(question.question)}
                    </legend>

                    <div
                        id="${prefix}Options"
                        class="game-choice-list"
                    >
                        ${options}
                    </div>
                </fieldset>

                <div
                    id="${prefix}Message"
                    class="game-message"
                    role="alert"
                ></div>

                <section
                    id="${prefix}Feedback"
                    class="game-feedback"
                    hidden
                ></section>

                <div class="game-actions">
                    <button
                        id="${prefix}Submit"
                        class="btn btn-gsb-primary btn-lg"
                        type="button"
                        disabled
                    >
                        Submit Answer
                    </button>

                    <button
                        id="${prefix}Next"
                        class="btn btn-gsb-primary btn-lg"
                        type="button"
                        hidden
                    >
                        Next Problem

                        <i class="bi bi-arrow-right" aria-hidden="true"></i>
                    </button>
                </div>
            </article>
        `;

        const submit = player.mount.querySelector(
            "#" + prefix + "Submit"
        );

        const next = player.mount.querySelector(
            "#" + prefix + "Next"
        );

        player.mount
            .querySelectorAll(
                "#" + prefix + "Options input[type=\"radio\"]"
            )
            .forEach(input => {
                input.addEventListener("change", () => {
                    submit.disabled = false;

                    player.mount.querySelector(
                        "#" + prefix + "Message"
                    ).textContent = "";
                });
            });

        submit.addEventListener(
            "click",
            () => submitAnswer(player)
        );

        next.addEventListener("click", () => {
            player.state.index += 1;
            renderQuestion(player);

            player.section.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        });
    }

    async function saveAnswer(player, payload, messageElement) {
        if (!window.GameApi) {
            return null;
        }

        const result = await window.GameApi.submit(payload);

        if (result.data && result.data.ok) {
            window.GameApi.renderSession(result.data.user);

            return result.data;
        }

        if (messageElement) {
            messageElement.textContent =
                (result.data && result.data.message) ||
                "Your AfriCOIN could not be saved to your account.";

            messageElement.className = "game-message error";
        }

        return null;
    }

    function lockOptions(player, question, selectedKey) {
        const prefix = player.config.id;

        player.mount
            .querySelectorAll(
                "#" + prefix + "Options input[type=\"radio\"]"
            )
            .forEach(input => {
                input.disabled = true;

                const label = player.mount.querySelector(
                    'label[for="' + input.id + '"]'
                );

                if (!label) {
                    return;
                }

                if (input.value === question.answer) {
                    label.classList.add("answer-correct");
                } else if (input.value === selectedKey) {
                    label.classList.add("answer-incorrect");
                }
            });

        player.mount.querySelector(
            "#" + prefix + "Submit"
        ).hidden = true;

        player.mount.querySelector(
            "#" + prefix + "Next"
        ).hidden = false;
    }

    function renderFeedback(player, question, selectedKey, awarded) {
        const game = player.game;
        const feedback = question.feedback || {};
        const correct = selectedKey === question.answer;

        const answerOption = question.options.find(
            option => option.key === question.answer
        );

        const selectedOption = question.options.find(
            option => option.key === selectedKey
        );

        const blocks = [];

        const why = correct
            ? cleanText(feedback.correct)
            : cleanText(feedback[selectedKey]);

        if (why) {
            blocks.push(`
                <div class="game-feedback-block">
                    <h3>
                        ${
                            correct
                                ? "Why this is the best answer"
                                : "Why that answer is not the best"
                        }
                    </h3>

                    <p>
                        ${escapeHtml(why)}
                    </p>
                </div>
            `);
        }

        if (!correct && answerOption) {
            blocks.push(`
                <div class="game-feedback-block">
                    <h3>
                        Best answer · ${answerOption.key}
                    </h3>

                    <p>
                        ${escapeHtml(answerOption.text)}
                    </p>

                    ${
                        cleanText(feedback.correct)
                            ? "<p>" +
                              escapeHtml(feedback.correct) +
                              "</p>"
                            : ""
                    }
                </div>
            `);
        }

        if (question.teachingPoint) {
            blocks.push(`
                <div class="game-feedback-block teaching">
                    <h3>
                        Teaching point
                    </h3>

                    <p>
                        ${escapeHtml(question.teachingPoint)}
                    </p>
                </div>
            `);
        }

        if (question.plotTwist) {
            blocks.push(`
                <div class="game-feedback-list">
                    <h3>
                        Plot twist
                    </h3>

                    <ul>
                        <li>
                            ${escapeHtml(question.plotTwist.scenario)}
                        </li>

                        <li>
                            ${escapeHtml(question.plotTwist.question)}
                            <strong>
                                ${escapeHtml(
                                    question.plotTwist.answer
                                )}
                            </strong>
                        </li>
                    </ul>
                </div>
            `);
        }

        const extras = [
            question.sdg
                ? "<li><strong>SDG link:</strong> " +
                  escapeHtml(question.sdg) +
                  "</li>"
                : "",

            question.ethicsFlash
                ? "<li><strong>Ethics flash:</strong> " +
                  escapeHtml(question.ethicsFlash) +
                  "</li>"
                : "",

            question.funLine
                ? "<li><strong>Remember:</strong> " +
                  escapeHtml(question.funLine) +
                  "</li>"
                : "",

            question.facilitatorTip
                ? "<li><strong>Facilitator tip:</strong> " +
                  escapeHtml(question.facilitatorTip) +
                  "</li>"
                : ""
        ]
            .filter(Boolean)
            .join("");

        if (extras) {
            blocks.push(`
                <div class="game-feedback-list">
                    <h3>
                        Debrief notes
                    </h3>

                    <ul>
                        ${extras}
                    </ul>
                </div>
            `);
        }

        const panel = player.mount.querySelector(
            "#" + player.config.id + "Feedback"
        );

        panel.innerHTML = `
            <div class="game-feedback-status ${
                correct ? "correct" : "incorrect"
            }">
                ${
                    correct
                        ? "Correct · +" +
                          awarded +
                          " " +
                          escapeHtml(game.currency)
                        : "Not this time · 0 " +
                          escapeHtml(game.currency)
                }
                ${
                    selectedOption && !correct
                        ? " (you chose " + selectedOption.key + ")"
                        : ""
                }
            </div>

            ${blocks.join("")}
        `;

        panel.hidden = false;
    }

    async function submitAnswer(player) {
        if (player.state.submitted) {
            return;
        }

        const question = currentQuestion(player);
        const prefix = player.config.id;

        const selected = player.mount.querySelector(
            "#" + prefix + "Options input[type=\"radio\"]:checked"
        );

        const message = player.mount.querySelector(
            "#" + prefix + "Message"
        );

        if (!selected) {
            message.textContent = "Please select one answer.";
            message.className = "game-message error";

            return;
        }

        player.state.submitted = true;

        const selectedKey = selected.value;
        const correct = selectedKey === question.answer;

        let awarded = correct ? question.points : 0;

        player.state.score += awarded;

        if (correct) {
            player.state.correct += 1;
        }

        const group = player.state.groups[question.group.key];

        if (group && correct) {
            group.correct += 1;
            group.score += awarded;
        }

        lockOptions(player, question, selectedKey);
        renderFeedback(player, question, selectedKey, awarded);

        showToast(
            correct
                ? "Correct · +" +
                  awarded +
                  " " +
                  player.game.currency
                : "Not this time · 0 " + player.game.currency,

            correct
                ? question.title
                : "Read the detailed feedback, then continue.",

            correct ? "correct" : "incorrect"
        );

        const saved = await saveAnswer(
            player,
            {
                gameId: player.game.id,
                questionId: question.id,
                answer: selectedKey,

                // Kept in step with the browser database: the server
                // scores the answer again from the game data.
                points: awarded,
                maximum: question.points,
                correct,
                label: question.label
            },
            message
        );

        if (saved && Number(saved.awarded) !== awarded) {
            const difference =
                Number(saved.awarded) - awarded;

            player.state.score += difference;
            awarded = Number(saved.awarded);

            if (group) {
                group.score += difference;
            }
        }

        const scorebar = player.mount.querySelector(
            "#" + prefix + "Scorebar"
        );

        if (scorebar) {
            scorebar.textContent =
                player.state.score +
                "/" +
                player.game.maximum;
        }
    }

    function scoreBand(game, score) {
        const bands = game.endGame?.score_bands || [];

        return (
            bands.find(
                band =>
                    score >= toNumber(band.min_africoin) &&
                    score <= toNumber(band.max_africoin)
            ) || { rank: "", message: "" }
        );
    }

    function groupCards(player) {
        return player.game.groups
            .map(group => {
                const tally =
                    player.state.groups[group.key] || {
                        correct: 0,
                        score: 0,
                        maximum: group.maximum,
                        total: group.questions.length
                    };

                const badge = group.badge;

                const unlocked = badge
                    ? tally.correct >= badge.threshold
                    : false;

                const badgeLine = badge
                    ? unlocked
                        ? badge.emoji +
                          " " +
                          escapeHtml(badge.name) +
                          " unlocked"
                        : "🔒 " +
                          escapeHtml(badge.name) +
                          " · " +
                          escapeHtml(
                              badge.unlockCondition ||
                              "keep playing"
                          )
                    : "";

                return `
                    <div class="col-md-4">
                        <article class="game-result-mini-card">
                            <span>
                                ${escapeHtml(group.label)}
                            </span>

                            <h3>
                                ${escapeHtml(
                                    group.name || group.fullLabel
                                )}
                            </h3>

                            <strong>
                                ${tally.score}/${tally.maximum}
                            </strong>

                            <p>
                                ${tally.correct} of ${tally.total}
                                correct
                            </p>

                            ${
                                badgeLine
                                    ? "<p>" + badgeLine + "</p>"
                                    : ""
                            }
                        </article>
                    </div>
                `;
            })
            .join("");
    }

    function debriefMarkup(game) {
        const endGame = game.endGame || {};
        const debrief = endGame.final_debrief || {};

        const framework =
            debrief.final_framework ||
            debrief.framework ||
            endGame.module_framework ||
            [];

        const question = cleanText(
            debrief.question,
            "What did the best decisions have in common?"
        );

        const answer = cleanText(
            debrief.answer,
            cleanText(endGame.final_message)
        );

        return `
            <div class="game-instructions">
                <h3>
                    ${escapeHtml(question)}
                </h3>

                ${
                    answer
                        ? "<p>" + escapeHtml(answer) + "</p>"
                        : ""
                }

                ${
                    framework.length
                        ? "<ul>" +
                          framework
                              .map(
                                  item =>
                                      "<li>" +
                                      escapeHtml(item) +
                                      "</li>"
                              )
                              .join("") +
                          "</ul>"
                        : ""
                }
            </div>
        `;
    }

    function renderResults(player) {
        const game = player.game;
        const state = player.state;

        const percentage = game.maximum
            ? Math.round((state.score / game.maximum) * 100)
            : 0;

        const incorrect = Math.max(
            0,
            game.questionCount - state.correct
        );

        const band = scoreBand(game, state.score);

        const badgesUnlocked = game.groups.filter(
            group =>
                (state.groups[group.key]?.correct || 0) >=
                (group.badge?.threshold ?? Number.MAX_SAFE_INTEGER)
        ).length;

        const medal =
            percentage === 100
                ? "🥇"
                : percentage >= 75
                    ? "🥈"
                    : percentage >= 50
                        ? "🥉"
                        : "🧭";

        const nextPlayer = player.config.nextId
            ? players.find(
                entry => entry.config.id === player.config.nextId
            )
            : null;

        player.mount.innerHTML = `
            <section class="game-card game-results">
                <div class="game-medal">
                    ${medal}
                </div>

                <span class="game-eyebrow">
                    ${escapeHtml(game.config.label)} complete
                </span>

                <h2>
                    Your final ${escapeHtml(game.currency)}
                </h2>

                <div class="game-final-score">
                    <strong>
                        ${state.score}
                    </strong>

                    <span>
                        /${game.maximum}
                    </span>
                </div>

                ${
                    band.rank
                        ? '<span class="game-result-band">' +
                          escapeHtml(band.rank) +
                          "</span>"
                        : ""
                }

                ${
                    band.message
                        ? "<p>" + escapeHtml(band.message) + "</p>"
                        : ""
                }

                <div class="game-stat-grid four">
                    <article>
                        <strong>
                            ${state.correct}
                        </strong>

                        <span>
                            Correct
                        </span>
                    </article>

                    <article>
                        <strong>
                            ${incorrect}
                        </strong>

                        <span>
                            Incorrect
                        </span>
                    </article>

                    <article>
                        <strong>
                            ${percentage}%
                        </strong>

                        <span>
                            Percentage
                        </span>
                    </article>

                    <article>
                        <strong>
                            ${badgesUnlocked}/${game.groups.length}
                        </strong>

                        <span>
                            Badges unlocked
                        </span>
                    </article>
                </div>

                <div class="game-result-section">
                    <h3>
                        Performance by
                        ${escapeHtml(
                            game.config.groupWord.toLowerCase()
                        )}
                    </h3>

                    <div class="row g-4">
                        ${groupCards(player)}
                    </div>
                </div>

                <div class="game-result-section">
                    <h3>
                        Final debrief
                    </h3>

                    ${debriefMarkup(game)}
                </div>

                <div class="game-actions centered">
                    <button
                        id="${game.config.id}Restart"
                        class="btn btn-gsb-primary btn-lg"
                        type="button"
                    >
                        Play ${escapeHtml(game.config.label)} again
                    </button>

                    ${
                        nextPlayer
                            ? '<button id="' +
                              game.config.id +
                              'NextGame" class="btn btn-gsb-outline btn-lg" type="button">Continue to ' +
                              escapeHtml(nextPlayer.config.label) +
                              "</button>"
                            : ""
                    }

                    <a
                        href="#quiz-centre"
                        class="btn btn-outline-secondary btn-lg"
                    >
                        All simulations
                    </a>
                </div>
            </section>
        `;

        player.mount
            .querySelector("#" + game.config.id + "Restart")
            .addEventListener("click", () => startGame(player));

        if (nextPlayer) {
            player.mount
                .querySelector("#" + game.config.id + "NextGame")
                .addEventListener("click", () => openGame(nextPlayer));
        }

        player.section.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    const players = SIMULATIONS.map(config =>
        createPlayer(config)
    );

    function setLoadingError(player, message) {
        if (player.button) {
            player.button.disabled = true;
        }

        if (player.status) {
            player.status.textContent = message;

            player.status.classList.add(
                "quiz-load-status-error"
            );
        }
    }

    async function loadGame(player) {
        try {
            const source = await fetchJson(
                new URL(
                    player.config.file,
                    document.baseURI
                ).href
            );

            player.game = normaliseGame(
                player.config,
                source
            );

            if (player.cardQuestions) {
                player.cardQuestions.textContent =
                    player.game.questionCount;
            }

            if (player.cardScore) {
                player.cardScore.textContent =
                    player.game.maximum;
            }

            if (player.status) {
                player.status.classList.remove(
                    "quiz-load-status-error"
                );

                player.status.textContent =
                    player.game.questionCount +
                    " problems · " +
                    player.game.groups.length +
                    " " +
                    player.config.groupWord.toLowerCase() +
                    "s · " +
                    player.game.maximum +
                    " " +
                    player.game.currency +
                    " available";
            }

            if (player.button) {
                const label = player.button.querySelector(
                    "[data-game-button-label]"
                );

                if (label) {
                    label.textContent =
                        "Start " + player.config.label;
                }

                player.button.disabled = false;
            }
        } catch (error) {
            console.error(error);

            setLoadingError(
                player,

                "This simulation could not be loaded. " +
                "Check that " +
                player.config.file +
                " is available."
            );
        }
    }

    players.forEach(player => {
        if (player.button) {
            player.button.addEventListener(
                "click",
                () => openGame(player)
            );
        }

        loadGame(player);
    });
});
