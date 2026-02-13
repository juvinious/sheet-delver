
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

export const enum ROLL_TABLE_FILTER {
    None = 1 << 0,
    DropChooseOne = 1 << 1,
    DistributeTwoStatsOnlyOnce = 1 << 2,
    DistributeTwoStatsAny = 1 << 3,
    HasDistributeStatsTable = 1 << 4,
    ChooseTwoInstead = 1 << 5,
    AddItemFromDescription = 1 << 6,
    ChooseOne = 1 << 7,
    DropOr = 1 << 8,
    RollPatronBoon = 1 << 9,
    RollPatronBoonTwice = 1 << 10,
    RollAnyPatronBoon = 1 << 11,
    WarlockSpecificTwelve = 1 << 12,
    DropTwoPointsToDistribute = 1 << 13,
    DropBlank = 1 << 14
};

// TODO Add UUIDs for classes
// Ranges 1-12 (max 12)
export const ROLL_TABLE_TALENT_MAP = {
    BLACK_LOTUS: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.pQAyZAcfrs9JrG0Q",
        map: [{
            range: [1, 1],
            filter: ROLL_TABLE_FILTER.ChooseTwoInstead
        },
        {
            range: [2, 2],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [3, 3],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [4, 4],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [5, 5],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [6, 6],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [7, 7],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [8, 8],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [9, 9],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [10, 10],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [11, 11],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [12, 12],
            filter: ROLL_TABLE_FILTER.None
        }
        ]
    },
    BARD: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.ZzffJkaIfmdPzdE7",
        map: [{
            range: [2, 2],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [3, 6],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [7, 9],
            filter: ROLL_TABLE_FILTER.DropTwoPointsToDistribute | ROLL_TABLE_FILTER.DistributeTwoStatsAny
        },
        {
            range: [10, 11],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [12, 12],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
        }
        ]
    },
    BASILISK_WARRIOR: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.khLpCbi8HThFjy9a",
        map: [{
            range: [2, 2],
            filter: ROLL_TABLE_FILTER.AddItemFromDescription
        },
        {
            range: [3, 6],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [7, 9],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [10, 11],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [12, 12],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
        }
        ]
    },
    DESERT_RIDER: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.vwwDlzGjfaiM0R4S",
        map: [{
            range: [2, 2],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [3, 6],
            filter: ROLL_TABLE_FILTER.DropOr | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [7, 9],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [10, 11],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [12, 12],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
        }
        ]
    },
    FIGHTER: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.dExHo4P85MgpwHd9",
        map: [{
            range: [2, 2],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [3, 6],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [7, 9],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [10, 11],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [12, 12],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
        }
        ]
    },
    KNIGHT_OF_ST_YDRIS: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.vPME2uXw5RuoKEP8",
        map: [{
            range: [2, 2],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [3, 6],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [7, 9],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [10, 11],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [12, 12],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
        }
        ]
    },
    PIT_FIGHTER: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.owING8sYmiI43Od0",
        map: [{
            range: [2, 2],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [3, 6],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [7, 9],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [10, 11],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [12, 12],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
        }
        ]
    },
    PRIEST: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.CtkKBhsOpV1v5YjX",
        map: [{
            range: [2, 2],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [3, 6],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [7, 9],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [10, 11],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [12, 12],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
        }
        ]
    },
    RANGER: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.PPsLlxyDTbhy1aRI",
        map: [{
            range: [2, 2],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [3, 6],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [7, 9],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [10, 11],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [12, 12],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
        }
        ]
    },
    RAS_GODAI: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.0vRwhfQgvAkzToHN",
        map: [{
            range: [2, 2],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [3, 6],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [7, 9],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [10, 11],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [12, 12],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
        }
        ]
    },
    SEA_WOLF: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.r87J1r4hXVNnPDUK",
        map: [{
            range: [2, 2],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [3, 6],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [7, 9],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [10, 11],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [12, 12],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
        }
        ]
    },
    SEER: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.XU4gJD2AK8FCeEZh",
        map: [{
            range: [2, 2],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [3, 6],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [7, 9],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [10, 11],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [12, 12],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
        }
        ]
    },
    THIEF: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.sLMGErVzVfKaLW7r",
        map: [{
            range: [2, 2],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [3, 5],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [6, 9],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [10, 11],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [12, 12],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
        }
        ]
    },
    WARLOCK: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.xM3hghlK5nvo46Vo",
        map: [{
            range: [2, 2],
            filter: ROLL_TABLE_FILTER.RollAnyPatronBoon
        },
        {
            range: [3, 6],
            filter: ROLL_TABLE_FILTER.DistributeTwoStatsOnlyOnce
        },
        {
            range: [7, 9],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [10, 11],
            filter: ROLL_TABLE_FILTER.RollPatronBoonTwice | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [12, 12],
            filter: ROLL_TABLE_FILTER.WarlockSpecificTwelve
        }
        ]
    },
    WITCH: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.fifOKQmilp9Y45lf",
        map: [{
            range: [2, 2],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [3, 7],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [8, 9],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [10, 11],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [12, 12],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
        }
        ]
    },
    WIZARD: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.RQ0vogfVtJGuT9oT",
        map: [{
            range: [2, 2],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [3, 7],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
        },
        {
            range: [8, 9],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [10, 11],
            filter: ROLL_TABLE_FILTER.None
        },
        {
            range: [12, 12],
            filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
        }
        ]
    }
}

export const ROLL_TABLE_PATRON_BOONS = {
    ALMAZZAT: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.hywroIYso1ANoq4N",
        map: [
            {
                range: [2, 2],
                filter: ROLL_TABLE_FILTER.None
            },
            {
                range: [3, 7],
                filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
            },
            {
                range: [8, 9],
                filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
            },
            {
                range: [10, 11],
                filter: ROLL_TABLE_FILTER.None
            },
            {
                range: [12, 12],
                filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
            }
        ]
    },
    KYTHEROS: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.3pf5QyJjatNkylNv",
        map: [
            {
                range: [2, 2],
                filter: ROLL_TABLE_FILTER.None
            },
            {
                range: [3, 7],
                filter: ROLL_TABLE_FILTER.None
            },
            {
                range: [8, 9],
                filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
            },
            {
                range: [10, 11],
                filter: ROLL_TABLE_FILTER.None
            },
            {
                range: [12, 12],
                filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
            }
        ]
    },
    MUGDULBLUB: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.uM6xHa4gqStMgONB",
        map: [
            {
                range: [2, 2],
                filter: ROLL_TABLE_FILTER.None
            },
            {
                range: [3, 7],
                filter: ROLL_TABLE_FILTER.None
            },
            {
                range: [8, 9],
                filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
            },
            {
                range: [10, 11],
                filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
            },
            {
                range: [12, 12],
                filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.DropBlank | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
            }
        ]
    },
    SHUNETHEVILE: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.oKkk7o3Zhlab2vie",
        map: [
            {
                range: [2, 2],
                filter: ROLL_TABLE_FILTER.None
            },
            {
                range: [3, 7],
                filter: ROLL_TABLE_FILTER.None
            },
            {
                range: [8, 9],
                filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
            },
            {
                range: [10, 11],
                filter: ROLL_TABLE_FILTER.None
            },
            {
                range: [12, 12],
                filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
            }
        ]
    },
    THEWILLOWMAN: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.jeMMr372yditrKMj",
        map: [
            {
                range: [2, 2],
                filter: ROLL_TABLE_FILTER.None
            },
            {
                range: [3, 7],
                filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
            },
            {
                range: [8, 9],
                filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
            },
            {
                range: [10, 11],
                filter: ROLL_TABLE_FILTER.None
            },
            {
                range: [12, 12],
                filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
            }
        ]
    },
    TITANIA: {
        UUID: "Compendium.shadowdark.rollable-tables.RollTable.mi0QYvreMf9j512E",
        map: [
            {
                range: [2, 2],
                filter: ROLL_TABLE_FILTER.None
            },
            {
                range: [3, 7],
                filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
            },
            {
                range: [8, 9],
                filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne
            },
            {
                range: [10, 11],
                filter: ROLL_TABLE_FILTER.None
            },
            {
                range: [12, 12],
                filter: ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.DropBlank | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable
            }
        ]
    },
};