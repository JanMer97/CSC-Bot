"use strict";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

// Dependencies
let moment = require("moment");
let parseOptions = require("minimist");

// Utils
let config = require("../utils/configHandler").getConfig();

const NUMBERS = [
    ":one:",
    ":two:",
    ":three:",
    ":four:",
    ":five:",
    ":six:",
    ":seven:",
    ":eight:",
    ":nine:",
    ":keycap_ten:"
];

const EMOJI = [
    "1️⃣",
    "2️⃣",
    "3️⃣",
    "4️⃣",
    "5️⃣",
    "6️⃣",
    "7️⃣",
    "8️⃣",
    "9️⃣",
    "🔟"
];

/**
 * Creates a new poll (multiple answers) or strawpoll (single selection)
 *
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").Message} message
 * @param {Array} args
 * @param {Function} callback
 * @returns {Function} callback
 */
exports.run = (client, message, args, callback) => {
    let options = parseOptions(args, {
        "boolean": [
            "channel",
            "extendable",
            "straw"
        ],
        alias: {
            channel: "c",
            extendable: "e",
            straw: "s"
        }
    });

    let parsedArgs = options._;

    if (!parsedArgs.length) return callback("Bruder da ist keine Umfrage :c");

    let pollArray = parsedArgs.join(" ").split(";").map(e => e.trim()).filter(e => e.replace(/\s/g, "") !== "");
    let pollOptions = pollArray.slice(1);

    if (!pollOptions.length) return callback("Bruder da sind keine Antwortmöglichkeiten :c");
    else if (pollOptions.length < 2) return callback("Bruder du musst schon mehr als eine Antwortmöglichkeit geben 🙄");
    else if (pollOptions.length > 10) return callback("Bitte gib nicht mehr als 10 Antwortmöglichkeiten an!");

    let optionstext = "";
    pollOptions.forEach((e, i) => (optionstext += `${NUMBERS[i]} - ${e}\n`));

    let embed = {
        embed: {
            title: pollArray[0],
            description: optionstext,
            timestamp: moment.utc().format(),
            author: {
                name: `${options.straw ? "Strawpoll" : "Umfrage"} von ${message.author.username}`,
                icon_url: message.author.displayAvatarURL()
            }
        }
    };

    let footer = [];
    let extendable = options.extendable && pollOptions.length < 10;

    if (extendable) {
        footer.push("Erweiterbar mit .extend als Reply");
        embed.embed.color = "GREEN";
    }

    if (!options.straw) footer.push("Mehrfachauswahl");

    if (footer.length) {
        embed.embed.footer = {
            text: footer.join(" • ")
        };
    }

    let channel = options.channel ? client.guilds.cache.get(config.ids.guild_id).channels.cache.get(config.ids.votes_channel_id) : message.channel;

    /** @type {import("discord.js").TextChannel} */
    (channel).send(/** @type {Object} embed */(embed))
        .then(async msg => {
            message.delete()
            for (let i in pollOptions) await msg.react(EMOJI[i]);
        });

    return callback();
};

exports.description = `Erstellt eine Umfrage mit mehreren Antwortmöglichkeiten (standardmäßig mit Mehrfachauswahl) (maximal 10).
Usage: ${config.bot_settings.prefix.command_prefix}poll [Optionen?] [Hier die Frage] ; [Antwort 1] ; [Antwort 2] ; [...]
Optionen:
\t-c, --channel
\t\t\tSendet die Umfrage in den Umfragenchannel, um den Slowmode zu umgehen
\t-e, --extendable
\t\t\tErlaubt die Erweiterung der Antwortmöglichkeiten durch jeden User mit .extend als Reply
\t-s, --straw
\t\t\tStatt mehrerer Antworten kann nur eine Antwort gewählt werden`;
