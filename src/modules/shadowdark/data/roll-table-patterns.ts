
// Extracted from roll-table-patterns scan
export const ROLL_TABLE_PATTERNS = {
    // Strings that indicate the player must make a choice from a list provided in the chat/modal
    CHOICE_INSTRUCTIONS: [
        "Choose 1",
        "Roll two Patron Boons and choose one to keep",
        "Select a spell" // Found in some contexts or useful to support
    ],
    // Strings that indicate a reroll condition, often handled automatically or by user
    REROLL_INSTRUCTIONS: [
        "Reroll if already taken",
        "Reroll duplicates",
        "<p>2 duplicate = reroll</p>",
        "<p>You may keep or reroll duplicates</p>"
    ]
};
