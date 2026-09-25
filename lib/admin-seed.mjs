/**
 * Richfield EDT900 Game Simulations
 * ---------------------------------------------------------------
 * The admin logins that are created on the first run.
 *
 * Local mode:  they are written to  data/admins.json  (readable and
 *              editable - change a password there or from the score
 *              monitor at any time).
 * Hosted mode: they are written to the hosted key/value store.
 *
 * Add as many administrators as you like to this list (or edit
 * data/admins.json directly later).
 */

export const ADMIN_LOGINS = [
    {
        username: "mbofhenijunior7@gmail.com",
        email: "mbofhenijunior7@gmail.com",
        password: "GRIT@2026",
        name: "Makhavhu MJ",
        role: "owner"
    }
];

/** The complete seed list: the main admin plus the extra logins. */
export function initialAdmins(config = {}) {
    const username =
        config.username || "admin";

    const password =
        config.password || "EDT900@2026";

    const admins = [
        {
            username,
            password,
            name: "Richfield EDT900 Administrator",
            role: "owner"
        }
    ];

    ADMIN_LOGINS.forEach(login => {
        const identifier = String(
            login.username || login.email || ""
        ).toLowerCase();

        if (
            !identifier ||
            admins.some(
                admin =>
                    String(admin.username).toLowerCase() ===
                    identifier
            )
        ) {
            return;
        }

        admins.push({ ...login });
    });

    return admins;
}
