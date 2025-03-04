import * as Discord from "discord.js";
import { Message, MessageReaction, User, VoiceState, GatewayIntentBits, Partials } from "discord.js";
import cron from "croner";


import * as conf from "./utils/configHandler.js";
import log from "./utils/logger.js";

// Handler
import messageHandler from "./handler/messageHandler.js";
import messageDeleteHandler from "./handler/messageDeleteHandler.js";
import BdayHandler from "./handler/bdayHandler.js";
import * as fadingMessageHandler from "./handler/fadingMessageHandler.js";
import * as storage from "./storage/storage.js";


import * as ban from "./commands/modcommands/ban.js";
import * as poll from "./commands/poll.js";
import GuildRagequit from "./storage/model/GuildRagequit.js";
import reactionHandler from "./handler/reactionHandler.js";
import { checkVoiceUpdate } from "./handler/voiceStateUpdateHandler.js";

import {
    handleInteractionEvent,
    messageCommandHandler,
    registerAllApplicationCommandsAsGuildCommands
} from "./handler/commandHandler.js";
import { quoteReactionHandler } from "./handler/quoteHandler.js";
import NicknameHandler from "./handler/nicknameHandler.js";
import { connectAndPlaySaufen } from "./handler/voiceHandler.js";
import { reminderHandler } from "./commands/erinnerung.js";
import { endAprilFools, startAprilFools } from "./handler/aprilFoolsHandler.js";
import { createBotContext, type BotContext } from "./context.js";
import { EhrePoints, EhreVotes } from "./storage/model/Ehre.js";
import { WoisData } from "./handler/voiceStateUpdateHandler.js";
import {
    woisVoteReactionHandler,
    woisVoteScheduler
} from "./commands/woisvote.js";
import { ReactionHandler } from "./types.js";
import { AoCHandler } from "./commands/aoc.js";
const version = conf.getVersion();
const appname = conf.getName();
const devname = conf.getAuthor();
const args = process.argv.slice(2);

const splashPadding = 12 + appname.length + version.toString().length;

console.log(
    `\n ┌${"─".repeat(splashPadding)}┐\n` +
    ` │ Started ${appname} v${version} │\n` +
    ` └${"─".repeat(splashPadding)}┘\n\n` +
    ` Copyright (c) ${(new Date()).getFullYear()} ${devname}\n`
);

let botContext: BotContext;

log.info("Started.");

const config = conf.getConfig();
const client = new Discord.Client({
    partials: [
        Partials.Message,
        Partials.Reaction,
        Partials.User
    ],
    allowedMentions: {
        parse: ["users"],
        repliedUser: true
    },
    intents: [
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildWebhooks
    ]
});

const reactionHandlers: ReactionHandler[] = [
    woisVoteReactionHandler
];

process.on("unhandledRejection", (err: any, promise) => {
    log.error(`Unhandled rejection (promise: ${promise})`, err);
});
process.on("uncaughtException", (err, origin) => {
    log.error(`Uncaught exception (origin: ${origin}`, err);
});
process.on("SIGTERM", signal => log.error(`Received Sigterm: ${signal}`));
process.on("beforeExit", code => {
    log.warn(`Process will exit with code: ${code}`);
    process.exit(code);
});
process.on("exit", code => {
    log.warn(`Process exited with code: ${code}`);
});


const clearWoisLogTask = async() => {
    WoisData.latestEvents = WoisData.latestEvents.filter(event => event.createdAt.getTime() > Date.now() - 2 * 60 * 1000);
};

const leetTask = async() => {
    const {hauptchat} = botContext.textChannels;
    const csz = botContext.guild;

    await hauptchat.send("Es ist `13:37` meine Kerle.\nBleibt hydriert! :grin: :sweat_drops:");

    // Auto-kick members
    const sadPinguEmote = csz.emojis.cache.find(e => e.name === "sadpingu");
    const dabEmote = csz.emojis.cache.find(e => e.name === "Dab");

    const membersToKick = (await csz.members.fetch())
        .filter(m => m.joinedTimestamp !== null && (Date.now() - m.joinedTimestamp >= 48 * 3_600_000))
        .filter(m => m.roles.cache.filter(r => r.name !== "@everyone").size === 0);

    log.info(`Identified ${membersToKick.size} members that should be kicked, these are: ${membersToKick.map(m => m.displayName).join(",")}.`);

    if (membersToKick.size === 0) {
        await hauptchat.send(`Heute leider keine Jocklerinos gekickt ${sadPinguEmote}`);
        return;
    }

    // We don't have trust in this code, so ensure that we don't kick any regular members :harold:
    if (membersToKick.size > 5) {
        // I think we don't need to kick more than 5 members at a time. If so, it is probably a bug and we don't want to to do that
        throw new Error(`You probably didn't want to kick ${membersToKick.size} members, or?`);
    }

    // I don't have trust in this code, so ensure that we don't kick any regular members :harold:
    console.assert(false, membersToKick.some(m => m.roles.cache.some(r => r.name === "Nerd")));


    const fetchedMembers = await Promise.all(membersToKick.map(m => m.fetch()));
    if (fetchedMembers.some(m => m.roles.cache.some(r => r.name === "Nerd"))) {
        throw new Error("There were members that had the nerd role assigned. You probably didn't want to kick them.");
    }

    await Promise.all([
        ...membersToKick.map(member => member.kick())
    ]);

    await hauptchat.send(`Hab grad ${membersToKick.size} Jocklerinos gekickt ${dabEmote}`);

    log.info(`Auto-kick: ${membersToKick.size} members kicked.`);
};

let firstRun = true;

client.once("ready", async initializedClient => {
    try {
        log.info("Running...");
        log.info(`Got ${client.users.cache.size} users, in ${client.channels.cache.size} channels of ${client.guilds.cache.size} guilds`);
        client.user!.setActivity(config.bot_settings.status);

        botContext = await createBotContext(initializedClient);
        console.assert(!!botContext); // TODO: Remove once botContext is used

        const cronOptions = {
            timezone: "Europe/Berlin"
        } as const;

        const bday = new BdayHandler(botContext);
        const aoc = new AoCHandler(botContext);
        log.info("Starting Nicknamehandler ");
        const nicknameHandler = new NicknameHandler(botContext);
        if (firstRun) {
            firstRun = false; // Hacky deadlock ...
            await storage.initialize(botContext);

            log.info("Scheduling 1338 Cronjob...");
            // eslint-disable-next-line no-unused-vars
            cron("37 13 * * *", cronOptions, leetTask);

            // eslint-disable-next-line no-unused-vars
            cron("5 * * * *", cronOptions, clearWoisLogTask);

            log.info("Scheduling Birthday Cronjob...");
            // eslint-disable-next-line no-unused-vars
            cron("1 0 * * *", cronOptions, async() => {
                log.debug("Entered Birthday cronjob");
                await bday.checkBdays();
            });
            await bday.checkBdays();

            log.info("Scheduling Advent of Code Cronjob...");
            // eslint-disable-next-line no-unused-vars
            cron("0 20 1-25 12 *", cronOptions, async() => {
                log.debug("Entered AoC cronjob");
                await aoc.publishLeaderBoard();
            });

            log.info("Scheduling Nickname Cronjob");
            // eslint-disable-next-line no-unused-vars
            cron("0 0 * * 0", cronOptions, async() => {
                log.debug("Entered Nickname cronjob");
                await nicknameHandler.rerollNicknames();
            });

            log.info("Scheduling Saufen Cronjob");
            // eslint-disable-next-line no-unused-vars
            cron("36 0-23 * * FRI-SUN", cronOptions, async() => {
                log.debug("Entered Saufen cronjob");
                await connectAndPlaySaufen(botContext);
            });

            log.info("Scheduling Reminder Cronjob");
            // eslint-disable-next-line no-unused-vars
            cron("* * * * *", cronOptions, async() => {
                log.debug("Entered reminder cronjob");
                await reminderHandler(botContext);
            });

            log.info("Scheduling Woisvote Cronjob");
            // eslint-disable-next-line no-unused-vars
            cron("* * * * *", cronOptions,
                async() => {
                    log.debug("Entered reminder cronjob");
                    await woisVoteScheduler(botContext);
                }
            );

            // eslint-disable-next-line no-unused-vars
            cron("2022-04-01T00:00:00", cronOptions, async() => {
                log.debug("Entered start april fools cronjob");
                await startAprilFools(botContext);
            });

            // eslint-disable-next-line no-unused-vars
            cron("2022-04-02T00:00:00", cronOptions, async() => {
                log.debug("Entered end april fools cronjob");
                await endAprilFools(botContext);
            });
            // eslint-disable-next-line no-unused-vars
            cron("1 0 * * *", cronOptions, async() => {
                log.debug("Entered start ehreReset cronjob");
                await Promise.all([EhrePoints.deflation(), EhreVotes.resetVotes()]);
            });

            // When the application is ready, slash commands should be registered
            await registerAllApplicationCommandsAsGuildCommands(botContext);
        }

        ban.startCron(botContext);

        await poll.importPolls();
        poll.startCron(botContext);

        // Not awaiting this promise because it's basically an infinite loop (that can be cancelled)
        // Possible TODO: Refactor this to a cron job
        void fadingMessageHandler.startLoop(client);

        log.info("Bot successfully started");
        if (args.includes("--dry-run")) {
            process.exit(0);
        }
    }
    catch (err) {
        log.error("Error in Ready handler:", err);
        process.exit(1);
    }
});


/**
 * This is an additional Message handler, that we use as a replacement
 * for the "old commands". This way we can easily migrate commands to slash commands
 * and still have the option to use the textual commands. Win-Win :cooldoge:
 */
client.on("messageCreate", async message =>
    void messageCommandHandler(message, client, botContext)
        .catch(err => log.error(`[messageCreate] Error on message ${message.id}`, err))
);

client.on("interactionCreate", interaction =>
    void handleInteractionEvent(interaction, client, botContext)
        .catch(err => log.error(`[interactionCreate] Error on interaction ${interaction.id}`, err))
);

client.on("guildCreate", guild => void log.info(`New guild joined: ${guild.name} (id: ${guild.id}) with ${guild.memberCount} members`));

client.on("guildDelete", guild => void log.info(`Deleted from guild: ${guild.name} (id: ${guild.id}).`));

client.on("guildMemberAdd", async member => {
    const numRagequits = await GuildRagequit.getNumRagequits(member.guild.id, member.id);
    if (numRagequits === 0) {
        return;
    }

    if (member.roles.cache.has(botContext.roles.shame.id)) {
        log.debug(`Member "${member.id}" already has the shame role, skipping`);
        return;
    }

    await member.roles.add(botContext.roles.shame);

    await botContext.textChannels.hauptchat.send({
        content: `Haha, schau mal einer guck wer wieder hergekommen ist! ${member} hast es aber nicht lange ohne uns ausgehalten. ${numRagequits > 1 ? "Und das schon zum " + numRagequits + ". mal" : ""}`,
        allowedMentions: {
            users: [member.id]
        }
    });
});

client.on("guildMemberRemove", async member => {
    try {
        await GuildRagequit.incrementRagequit(member.guild.id, member.id);
    }
    catch (err) {
        log.error(`[guildMemberRemove] Error on incrementing ragequit of ${member.id}`, err);
    }
});

client.on("messageCreate", async message => {
    try {
        await messageHandler(message, client, botContext);
    }
    catch (err) {
        log.error(`[messageCreate] Error on message ${message.id}`, err);
    }
});

client.on("messageDelete", async message => {
    try {
        if(message.inGuild()) {
            await messageDeleteHandler(message, client, botContext);
        }
    }
    catch (err) {
        log.error(`[messageDelete] Error for ${message.id}`, err);
    }
});

client.on("messageUpdate", async(_, newMessage) => {
    try {
        await messageHandler(newMessage as Message, client, botContext);
    }
    catch (err) {
        log.error(`[messageUpdate] Error on message ${newMessage.id}`, err);
    }
});

client.on("error", e => void log.error("Discord Client Error", e));
client.on("warn", w => void log.warn("Discord Client Warning", w));
client.on("debug", d => {
    if (d.includes("Heartbeat")) {
        return;
    }

    log.debug("Discord Client Debug d", d);
});
client.on("rateLimit", rateLimitData => void log.error(`Discord Client RateLimit Shit: ${JSON.stringify(rateLimitData)}`));
client.on("invalidated", () => void log.debug("Client invalidated"));

// TODO: Refactor to include in reaction handlers
client.on("messageReactionAdd", async(event, user) => reactionHandler(event as MessageReaction, user as User, client, false));
client.on("messageReactionAdd", async(event, user) => quoteReactionHandler(event as MessageReaction, user as User, botContext));
client.on("messageReactionRemove", async(event, user) => reactionHandler(event as MessageReaction, user as User, client, true));

client.on("messageReactionAdd", async(event, user) => {
    for(const handler of reactionHandlers) {
        await handler(event as MessageReaction, user as User, botContext, false);
    }
});
client.on("messageReactionRemove", async(event, user) => {
    for(const handler of reactionHandlers) {
        await handler(event as MessageReaction, user as User, botContext, true);
    }
});

client.on("voiceStateUpdate", async(oldState, newState) => checkVoiceUpdate(oldState as VoiceState, newState as VoiceState, botContext));

client.login(config.auth.bot_token).then(() => {
    log.info("Token login was successful!");
}, err => {
    log.error("Token login was not successful", err);
    log.error("Shutting down due to incorrect token...\n\n");
    process.exit(1);
});
