/**
 * Richfield EDT900 Game Simulations
 * ---------------------------------------------------------------
 * Score monitor logic for admin.html.
 *
 *   - admin sign in / sign out
 *   - summary boxes for every registered student
 *   - the student table with a search filter
 *   - the per-problem drill-down for one student
 *   - CSV exports (students and per-problem detail)
 */

(function () {
    "use strict";

    const api = window.GameApi;

    const elements = {
        loginCard: document.getElementById("adminLoginCard"),
        loginForm: document.getElementById("adminLoginForm"),
        loginBtn: document.getElementById("loginBtn"),
        loginMessage: document.getElementById("loginMessage"),

        chip: document.getElementById("adminChip"),
        adminName: document.getElementById("adminName"),
        signOut: document.getElementById("adminSignOut"),

        dashboard: document.getElementById("adminDashboard"),
        summaryLine: document.getElementById("adminSummaryLine"),
        message: document.getElementById("adminMessage"),
        stats: document.getElementById("adminStats"),

        tableBody: document.getElementById("adminTableBody"),
        search: document.getElementById("adminSearch"),

        refresh: document.getElementById("refreshBtn"),
        csvSummary: document.getElementById("csvSummaryBtn"),
        csvQuestions: document.getElementById("csvQuestionsBtn"),

        detail: document.getElementById("adminDetail"),
        detailTitle: document.getElementById("detailTitle"),
        detailSubtitle: document.getElementById("detailSubtitle"),
        detailBody: document.getElementById("detailTableBody"),
        detailClose: document.getElementById("detailCloseBtn"),

        passwordForm: document.getElementById("passwordForm"),
        passwordBtn: document.getElementById("passwordBtn"),
        passwordMessage: document.getElementById("passwordMessage"),

        currentPassword: document.getElementById("currentPassword"),
        newPassword: document.getElementById("newPassword"),
        confirmPassword: document.getElementById("confirmNewPassword")
    };

    let allUsers = [];

    function showMessage(element, text, type) {
        element.textContent = text || "";

        element.className =
            "auth-message" +
            (text ? " show " : "") +
            (type || "");
    }

    function statCard(label, value, note) {
        return (
            '<article class="admin-stat">' +
            "<span>" + api.escapeHtml(label) + "</span>" +
            "<strong>" + api.escapeHtml(value) + "</strong>" +
            (note ? "<small>" + api.escapeHtml(note) + "</small>" : "") +
            "</article>"
        );
    }

    function userRow(user, index) {
        const games = user.points.games;

        const answered =
            user.points.answered + " of " + user.points.questions;

        const gameCells = ["sim0", "sim1", "sim2"]
            .map(gameId => {
                const game = games[gameId];

                return (
                    '<td class="score">' +
                    api.escapeHtml(
                        game
                            ? game.points + " / " + game.maximum
                            : "0"
                    ) +
                    "</td>"
                );
            })
            .join("");

        return (
            "<tr>" +
            '<td><span class="admin-rank' +
            (index < 3 ? " top" : "") +
            '">' + (index + 1) + "</span></td>" +
            '<td class="strong">' + api.escapeHtml(user.fullName) + "</td>" +
            "<td>" + api.escapeHtml(user.email) + "</td>" +
            "<td>" + api.escapeHtml(api.formatStamp(user.createdAt)) + "</td>" +
            "<td>" + api.escapeHtml(api.formatStamp(user.lastSeenAt)) + "</td>" +
            gameCells +
            '<td class="score">' + user.points.total +
            " / " + user.points.maximum + "</td>" +
            "<td>" + api.escapeHtml(answered) + "</td>" +
            "<td>" +
            '<button class="admin-open" type="button" data-user-id="' +
            api.escapeHtml(user.id) +
            '">Questions</button>' +
            "</td>" +
            "</tr>"
        );
    }

    function renderTable() {
        const term = elements.search.value.trim().toLowerCase();

        const rows = allUsers.filter(user => {
            if (!term) {
                return true;
            }

            return (
                user.fullName.toLowerCase().includes(term) ||
                user.email.toLowerCase().includes(term)
            );
        });

        if (!rows.length) {
            elements.tableBody.innerHTML =
                '<tr><td class="empty" colspan="11">' +
                (allUsers.length
                    ? "No student matches that search."
                    : "No student has registered yet. Share the register page " +
                      "and their AfriCOIN will appear here.") +
                "</td></tr>";

            return;
        }

        elements.tableBody.innerHTML = rows
            .map(userRow)
            .join("");
    }

    function renderStats(summary) {
        const gameCards = summary.games
            .map(game =>
                statCard(
                    game.label + " AfriCOIN",
                    game.average + " avg",
                    game.maximum + " AfriCOIN available"
                )
            )
            .join("");

        elements.stats.innerHTML =
            statCard(
                "Students registered",
                summary.users,
                summary.activeToday + " active today"
            ) +
            statCard(
                "AfriCOIN earned in total",
                summary.totalPoints,
                summary.averagePoints + " average per student"
            ) +
            statCard(
                "Top student",
                summary.topScorer ? summary.topScorer.points : 0,
                summary.topScorer
                    ? summary.topScorer.fullName
                    : "Waiting for the first simulation"
            ) +
            gameCards;

        elements.summaryLine.textContent =
            summary.users +
            (summary.users === 1 ? " student" : " students") +
            " · " +
            summary.totalPoints +
            " AfriCOIN earned · " +
            summary.maximumTotal +
            " AfriCOIN available per student";
    }

    async function loadUsers() {
        showMessage(elements.message, "Loading students...", "");

        const result = await api.adminUsers();

        if (!result.data || !result.data.ok) {
            if (result.status === 401) {
                showLogin("Your admin session has ended. Please sign in again.");
                return;
            }

            showMessage(
                elements.message,
                (result.data && result.data.message) ||
                "The student list could not be loaded.",
                "error"
            );

            return;
        }

        allUsers = result.data.users;

        renderStats(result.data.summary);
        renderTable();

        showMessage(elements.message, "", "");
    }

    async function openUser(id) {
        showMessage(elements.message, "Loading student detail...", "");

        const result = await api.adminUser(id);

        if (!result.data || !result.data.ok) {
            showMessage(
                elements.message,
                (result.data && result.data.message) ||
                "That student could not be loaded.",
                "error"
            );

            return;
        }

        const user = result.data.user;

        elements.detailTitle.textContent = user.fullName;
        elements.detailSubtitle.textContent =
            user.email +
            " · " +
            user.points.total +
            " of " +
            user.points.maximum +
            " AfriCOIN · " +
            user.points.correct +
            " of " +
            user.points.answered +
            " answered correctly";

        if (!result.data.questions.length) {
            elements.detailBody.innerHTML =
                '<tr><td class="empty" colspan="7">' +
                "This student has not answered a problem yet." +
                "</td></tr>";
        } else {
            elements.detailBody.innerHTML = result.data.questions
                .map(row =>
                    "<tr>" +
                    "<td>" + api.escapeHtml(row.gameLabel) + "</td>" +
                    '<td class="strong">' + api.escapeHtml(row.label) + "</td>" +
                    '<td class="score">' + row.points + "</td>" +
                    "<td>" + row.maximum + "</td>" +
                    "<td>" + (row.correctEver ? "Yes" : "No") + "</td>" +
                    "<td>" + row.plays + "</td>" +
                    "<td>" + api.escapeHtml(api.formatStamp(row.lastAt)) + "</td>" +
                    "</tr>"
                )
                .join("");
        }

        elements.detail.hidden = false;
        elements.detail.scrollIntoView({ behavior: "smooth", block: "start" });

        showMessage(elements.message, "", "");
    }

    function showLogin(message) {
        elements.dashboard.hidden = true;
        elements.chip.hidden = true;
        elements.loginCard.hidden = false;
        elements.detail.hidden = true;
        elements.adminName.textContent = "";

        if (message) {
            showMessage(elements.loginMessage, message, "error");
        }
    }

    function showDashboard(admin) {
        elements.loginCard.hidden = true;
        elements.dashboard.hidden = false;
        elements.chip.hidden = false;
        elements.adminName.textContent = admin.username;

        showMessage(elements.loginMessage, "", "");
    }

    elements.loginForm.addEventListener("submit", async event => {
        event.preventDefault();

        elements.loginBtn.disabled = true;
        showMessage(elements.loginMessage, "", "");

        const result = await api.adminLogin({
            username: document.getElementById("username").value,
            password: document.getElementById("password").value,
            remember: document.getElementById("remember").checked
        });

        elements.loginBtn.disabled = false;

        if (!result.data || !result.data.ok) {
            showMessage(
                elements.loginMessage,
                (result.data && result.data.message) ||
                "Sign in failed. Please try again.",
                "error"
            );

            return;
        }

        document.getElementById("password").value = "";

        showDashboard(result.data.admin);
        loadUsers();
    });

    elements.signOut.addEventListener("click", async () => {
        await api.adminLogout();

        showLogin("You have signed out of the score monitor.");
    });

    elements.refresh.addEventListener("click", () => {
        loadUsers();
    });

    elements.csvSummary.addEventListener("click", () => {
        api.downloadCsv("summary");
    });

    elements.csvQuestions.addEventListener("click", () => {
        api.downloadCsv("questions");
    });

    elements.search.addEventListener("input", () => {
        renderTable();
    });

    elements.tableBody.addEventListener("click", event => {
        const button = event.target.closest("[data-user-id]");

        if (button) {
            openUser(button.dataset.userId);
        }
    });

    elements.detailClose.addEventListener("click", () => {
        elements.detail.hidden = true;
    });

    elements.passwordForm.addEventListener("submit", async event => {
        event.preventDefault();

        const next = elements.newPassword.value;
        const confirm = elements.confirmPassword.value;

        if (next !== confirm) {
            showMessage(
                elements.passwordMessage,
                "The two new passwords do not match.",
                "error"
            );

            return;
        }

        elements.passwordBtn.disabled = true;

        const result = await api.call("api/admin/password", {
            method: "POST",

            body: {
                currentPassword: elements.currentPassword.value,
                newPassword: next
            }
        });

        elements.passwordBtn.disabled = false;

        if (!result.data || !result.data.ok) {
            showMessage(
                elements.passwordMessage,
                (result.data && result.data.message) ||
                "The admin password could not be changed.",
                "error"
            );

            return;
        }

        elements.passwordForm.reset();

        showMessage(
            elements.passwordMessage,
            "The admin password has been updated.",
            "success"
        );
    });

    (async function start() {
        const result = await api.adminMe();

        if (result.data && result.data.ok) {
            showDashboard(result.data.admin);
            loadUsers();
            return;
        }

        showLogin("");
    })();
})();
