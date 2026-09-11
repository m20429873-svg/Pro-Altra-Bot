require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

// ======================================================
//                    CONFIG
// ======================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || "";

// Minecraft Server
const SERVER_IP = "Coper-_-crfte.aternos.me:31246";
const SERVER_PORT = "31246";

// Spam
const SPAM_COOLDOWN = 10 * 1000;

// Points
const POINT_COOLDOWN = 60 * 1000;

// Warn #4 ban duration
const BAN_DURATION = 24 * 60 * 60 * 1000;

// ======================================================
//                    ROLES
// ======================================================

const STAFF_ROLES = [
  { name: "Trial", level: 0, points: 0 },
  { name: "Helper", level: 1, points: 100 },
  { name: "Sr Helper", level: 2, points: 200 },
  { name: "Mod", level: 3, points: 300 },
  { name: "Sr Mod", level: 4, points: 400 },
  { name: "Jr Admin", level: 5, points: 500 },
  { name: "Admin", level: 6, points: 600 },
  { name: "Co Owner", level: 7, points: 700 },
  { name: "Hp Owner", level: 8, points: 800 },
  { name: "Owner", level: 9, points: 900 }
];

const PLAYER_ROLE = "player";

// ======================================================
//                    DATABASE
// ======================================================

const DB_FILE = path.join(__dirname, "database.json");

let db = {
  points: {},
  warns: {},
  tickets: {},
  spam: {},
  pointCooldown: {},
  banUntil: {}
};

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      saveDB();
      return;
    }

    const data = fs.readFileSync(DB_FILE, "utf8");

    if (data.trim()) {
      db = {
        ...db,
        ...JSON.parse(data)
      };
    }
  } catch (error) {
    console.log("❌ Database load error:", error.message);
  }
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (error) {
    console.log("❌ Database save error:", error.message);
  }
}

loadDB();

// ======================================================
//                    CLIENT
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Channel,
    Partials.GuildMember,
    Partials.User
  ]
});

// ======================================================
//                    HELPERS
// ======================================================

function isServerOwner(member) {
  return member.guild.ownerId === member.id;
}

function getStaffRole(member) {
  return STAFF_ROLES
    .map(roleInfo => ({
      ...roleInfo,
      role: member.guild.roles.cache.find(
        r => r.name.toLowerCase() === roleInfo.name.toLowerCase()
      )
    }))
    .filter(x => x.role && member.roles.cache.has(x.role.id))
    .sort((a, b) => b.level - a.level)[0] || null;
}

function getStaffLevel(member) {
  if (isServerOwner(member)) return 999;

  const role = getStaffRole(member);

  return role ? role.level : -1;
}

function isStaff(member) {
  return getStaffLevel(member) >= 0;
}

function canWarn(member) {
  return getStaffLevel(member) >= 3 || isServerOwner(member);
}

function getPoints(userId) {
  return Number(db.points[userId] || 0);
}

function setPoints(userId, amount) {
  db.points[userId] = Math.max(0, Math.floor(amount));
  saveDB();
}

function getWarns(userId) {
  return Number(db.warns[userId] || 0);
}

function setWarns(userId, amount) {
  db.warns[userId] = Math.max(0, Math.floor(amount));
  saveDB();
}

function cleanChannelName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 70);
}

function findTicketForUser(guildId, userId) {
  const ticket = db.tickets[userId];

  if (!ticket) return null;

  if (ticket.guildId !== guildId) {
    return null;
  }

  return ticket;
}

function getHighestRoleLevel(member) {
  return getStaffLevel(member);
}

// ======================================================
//              CREATE / GET STAFF ROLES
// ======================================================

async function ensureRoles(guild) {
  const roles = {};

  for (const info of STAFF_ROLES) {
    let role = guild.roles.cache.find(
      r => r.name.toLowerCase() === info.name.toLowerCase()
    );

    if (!role) {
      try {
        role = await guild.roles.create({
          name: info.name,
          reason: "Pro-Altra-Bot staff system"
        });

        console.log(`✅ Created role: ${info.name}`);
      } catch (error) {
        console.log(
          `❌ Could not create role ${info.name}:`,
          error.message
        );
      }
    }

    if (role) {
      roles[info.name] = role;
    }
  }

  let playerRole = guild.roles.cache.find(
    r => r.name.toLowerCase() === PLAYER_ROLE.toLowerCase()
  );

  if (!playerRole) {
    try {
      playerRole = await guild.roles.create({
        name: PLAYER_ROLE,
        reason: "Pro-Altra-Bot player role"
      });

      console.log("✅ Created player role");
    } catch (error) {
      console.log("❌ Could not create player role:", error.message);
    }
  }

  roles[PLAYER_ROLE] = playerRole;

  return roles;
}

// ======================================================
//                    PROMOTION
// ======================================================

async function updateStaffRank(member) {
  if (!member || !member.guild) return;

  // Server owner is never modified
  if (isServerOwner(member)) return;

  const points = getPoints(member.id);

  let target = STAFF_ROLES[0];

  for (const roleInfo of STAFF_ROLES) {
    if (points >= roleInfo.points) {
      target = roleInfo;
    }
  }

  const allStaffRoleObjects = STAFF_ROLES
    .map(x =>
      member.guild.roles.cache.find(
        r => r.name.toLowerCase() === x.name.toLowerCase()
      )
    )
    .filter(Boolean);

  const targetRole = member.guild.roles.cache.find(
    r => r.name.toLowerCase() === target.name.toLowerCase()
  );

  if (!targetRole) return;

  try {
    // Remove every staff rank
    for (const role of allStaffRoleObjects) {
      if (member.roles.cache.has(role.id) && role.id !== targetRole.id) {
        await member.roles.remove(role);
      }
    }

    // Add target rank
    if (!member.roles.cache.has(targetRole.id)) {
      await member.roles.add(targetRole);
    }

    // Remove player from staff members
    const playerRole = member.guild.roles.cache.find(
      r => r.name.toLowerCase() === PLAYER_ROLE.toLowerCase()
    );

    if (playerRole && member.roles.cache.has(playerRole.id)) {
      await member.roles.remove(playerRole).catch(() => {});
    }
  } catch (error) {
    console.log(
      `❌ Rank update error for ${member.user.tag}:`,
      error.message
    );
  }
}

// ======================================================
//                    COMMANDS
// ======================================================

const commands = [

  new SlashCommandBuilder()
    .setName("ip")
    .setDescription("عرض IP السيرفر"),

  new SlashCommandBuilder()
    .setName("points")
    .setDescription("عرض نقاطك أو نقاط إداري")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("addpoints")
    .setDescription("إضافة نقاط لإداري")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("الإداري")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("عدد النقاط")
        .setMinValue(1)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("removepoints")
    .setDescription("إنقاص نقاط إداري")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("الإداري")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("عدد النقاط")
        .setMinValue(1)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("تحذير عضو")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("سبب التحذير")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("عرض تحذيرات عضو")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ticket-setup")
    .setDescription("إنشاء لوحة التذاكر"),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("عرض رتبتك ونقاطك"),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("طرد عضو")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("السبب")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("تايم أوت لعضو")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("عدد الدقائق")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("السبب")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("حظر عضو")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("السبب")
        .setRequired(false)
    )
];

const commandData = commands.map(command => command.toJSON());

// ======================================================
//                 REGISTER COMMANDS
// ======================================================

async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    if (GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commandData }
      );

      console.log("✅ Guild slash commands registered");
    } else {
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commandData }
      );

      console.log("✅ Global slash commands registered");
    }
  } catch (error) {
    console.log("❌ Command registration error:", error);
  }
}

// ======================================================
//                    READY
// ======================================================

client.once("ready", async () => {
  console.log("=================================");
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🆔 Client ID: ${client.user.id}`);
  console.log("=================================");

  for (const guild of client.guilds.cache.values()) {
    await ensureRoles(guild);
  }

  await registerCommands();

  client.user.setPresence({
    activities: [
      {
        name: "JAFA | Tickets & Staff",
        type: 3
      }
    ],
    status: "online"
  });

  // Check old 24h bans after restart
  await checkExpiredBans();
});

// ======================================================
//                 MEMBER JOIN
// ======================================================

client.on("guildMemberAdd", async member => {
  try {
    const roles = await ensureRoles(member.guild);

    const playerRole = roles[PLAYER_ROLE];

    if (playerRole) {
      await member.roles.add(playerRole);
    }

    const channel = member.guild.systemChannel;

    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("👋 عضو جديد!")
        .setDescription(
          `أهلًا وسهلًا ${member} في **${member.guild.name}** ❤️`
        )
        .addFields({
          name: "👤 العضو",
          value: `${member.user.tag}`,
          inline: true
        })
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

      await channel.send({ embeds: [embed] }).catch(() => {});
    }

  } catch (error) {
    console.log("❌ Member join error:", error.message);
  }
});

// ======================================================
//                    MESSAGE
// ======================================================

client.on("messageCreate", async message => {
  if (!message.guild) return;
  if (message.author.bot) return;

  // ==========================================
  // IP COMMAND
  // ==========================================

  if (message.content.trim().toLowerCase() === "ip") {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🌐 JAFA Server")
      .setDescription(
        `**JAFA:** ${SERVER_IP}\n**Port:** ${SERVER_PORT}`
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] }).catch(() => {});
  }

  // ==========================================
  // SERVER OWNER BYPASS
  // ==========================================

  const owner = message.guild.ownerId === message.author.id;

  // ==========================================
  // SPAM PROTECTION
  // ==========================================

  if (!owner) {
    const now = Date.now();
    const lastMessage = db.spam[message.author.id] || 0;

    if (now - lastMessage < SPAM_COOLDOWN) {
      await message.delete().catch(() => {});
      return;
    }

    db.spam[message.author.id] = now;
    saveDB();
  }

  // ==========================================
  // POINT SYSTEM
  // ONLY STAFF
  // ==========================================

  const member = message.member;

  if (!member) return;

  const staff = isStaff(member);

  if (!staff) return;

  // Owner does not need points
  if (owner) return;

  const now = Date.now();

  const lastPoint =
    db.pointCooldown[member.id] || 0;

  if (now - lastPoint < POINT_COOLDOWN) {
    return;
  }

  db.pointCooldown[member.id] = now;

  db.points[member.id] =
    getPoints(member.id) + 1;

  saveDB();

  // Auto promotion
  await updateStaffRank(member);
});

// ======================================================
//                 INTERACTIONS
// ======================================================

client.on("interactionCreate", async interaction => {

  try {

    // ==================================================
    // BUTTONS
    // ==================================================

    if (interaction.isButton()) {

      // ================================================
      // OPEN TICKET
      // ================================================

      if (interaction.customId === "open_ticket") {

        const guild = interaction.guild;
        const user = interaction.user;

        const existing = findTicketForUser(
          guild.id,
          user.id
        );

        if (existing) {

          const oldChannel =
            guild.channels.cache.get(existing.channelId);

          if (oldChannel) {
            return interaction.reply({
              content:
                `❌ عندك تذكرة مفتوحة بالفعل: ${oldChannel}`,
              ephemeral: true
            });
          }

          // Channel no longer exists
          delete db.tickets[user.id];
          saveDB();
        }

        await interaction.deferReply({
          ephemeral: true
        });

        const category = interaction.channel?.parent;

        const channelName =
          `ticket-${cleanChannelName(user.username)}`;

        const overwrites = [
          {
            id: guild.roles.everyone.id,
            deny: [
              PermissionFlagsBits.ViewChannel
            ]
          },
          {
            id: user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles
            ]
          }
        ];

        // Give every staff rank access
        for (const info of STAFF_ROLES) {

          const role = guild.roles.cache.find(
            r =>
              r.name.toLowerCase() ===
              info.name.toLowerCase()
          );

          if (!role) continue;

          overwrites.push({
            id: role.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ]
          });
        }

        const ticketChannel =
          await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category?.type === ChannelType.GuildCategory
              ? category.id
              : null,
            permissionOverwrites: overwrites,
            reason: `Ticket opened by ${user.tag}`
          });

        db.tickets[user.id] = {
          guildId: guild.id,
          channelId: ticketChannel.id,
          createdAt: Date.now()
        };

        saveDB();

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🎫 تذكرة جديدة")
          .setDescription(
            `مرحبًا ${user} ❤️\n\n` +
            `اكتب مشكلتك أو طلبك هنا وسيتم الرد عليك من الإدارة.\n\n` +
            `🔒 **ملاحظة:** لا يمكنك فتح تذكرة أخرى حتى يتم إغلاق هذه التذكرة.`
          )
          .addFields({
            name: "👤 صاحب التذكرة",
            value: `${user}`,
            inline: true
          })
          .setTimestamp();

        // Close button is available ONLY to Owner
        const closeButton =
          new ButtonBuilder()
            .setCustomId("close_ticket")
            .setLabel("إغلاق التذكرة")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger);

        const row =
          new ActionRowBuilder()
            .addComponents(closeButton);

        await ticketChannel.send({
          content: `${user}`,
          embeds: [embed],
          components: [row]
        });

        await interaction.editReply({
          content:
            `✅ تم فتح تذكرتك: ${ticketChannel}`
        });

        return;
      }

      // ================================================
      // CLOSE TICKET
      // ONLY SERVER OWNER
      // ================================================

      if (interaction.customId === "close_ticket") {

        if (!isServerOwner(interaction.member)) {

          return interaction.reply({
            content:
              "❌ إغلاق التذاكر مسموح لصاحب السيرفر فقط.",
            ephemeral: true
          });
        }

        const channel = interaction.channel;

        let ticketOwnerId = null;

        for (const [userId, ticket] of Object.entries(db.tickets)) {
          if (ticket.channelId === channel.id) {
            ticketOwnerId = userId;
            break;
          }
        }

        await interaction.reply({
          content: "🔒 سيتم إغلاق التذكرة خلال 3 ثواني..."
        });

        if (ticketOwnerId) {
          delete db.tickets[ticketOwnerId];
          saveDB();
        }

        setTimeout(async () => {
          await channel.delete(
            "Ticket closed by server owner"
          ).catch(() => {});
        }, 3000);

        return;
      }
    }

    // ==================================================
    // SLASH COMMANDS
    // ==================================================

    if (!interaction.isChatInputCommand()) return;

    const member = interaction.member;
    const guild = interaction.guild;

    // ==================================================
    // /ip
    // ==================================================

    if (interaction.commandName === "ip") {

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🌐 JAFA Server")
        .setDescription(
          `**JAFA:** ${SERVER_IP}\n` +
          `**Port:** ${SERVER_PORT}`
        )
        .setTimestamp();

      return interaction.reply({
        embeds: [embed]
      });
    }

    // ==================================================
    // /rank
    // ==================================================

    if (interaction.commandName === "rank") {

      const points = getPoints(member.id);
      const role = getStaffRole(member);

      const currentRank =
        isServerOwner(member)
          ? "Owner"
          : role?.name || "Player";

      let nextRank = "Owner";
      let needed = 0;

      if (!isServerOwner(member)) {

        const next = STAFF_ROLES.find(
          x => x.points > points
        );

        if (next) {
          nextRank = next.name;
          needed = next.points - points;
        }
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📊 معلومات الإدارة")
        .addFields(
          {
            name: "👤 العضو",
            value: `${member}`,
            inline: true
          },
          {
            name: "🏅 الرتبة",
            value: currentRank,
            inline: true
          },
          {
            name: "⭐ النقاط",
            value: `${points}`,
            inline: true
          },
          {
            name: "🚀 الترقية القادمة",
            value: isServerOwner(member)
              ? "أعلى رتبة"
              : `${nextRank} — باقي ${needed} نقطة`,
            inline: false
          }
        )
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    // ==================================================
    // /points
    // ==================================================

    if (interaction.commandName === "points") {

      const target =
        interaction.options.getMember("user") ||
        member;

      const points = getPoints(target.id);
      const role = getStaffRole(target);

      const rank =
        isServerOwner(target)
          ? "Owner"
          : role?.name || "Player";

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("⭐ النقاط")
            .setDescription(
              `${target}\n\n` +
              `🏅 **الرتبة:** ${rank}\n` +
              `⭐ **النقاط:** ${points}`
            )
        ]
      });
    }

    // ==================================================
    // OWNER ONLY POINT MANAGEMENT
    // ==================================================

    if (
      interaction.commandName === "addpoints" ||
      interaction.commandName === "removepoints"
    ) {

      if (!isServerOwner(member)) {
        return interaction.reply({
          content:
            "❌ هذا الأمر لصاحب السيرفر فقط.",
          ephemeral: true
        });
      }

      const target =
        interaction.options.getMember("user");

      const amount =
        interaction.options.getInteger("amount");

      if (!target) {
        return interaction.reply({
          content: "❌ العضو غير موجود.",
          ephemeral: true
        });
      }

      // Owner cannot modify himself
      if (target.id === member.id) {
        return interaction.reply({
          content:
            "❌ لا يمكنك تعديل نقاط نفسك.",
          ephemeral: true
        });
      }

      // Only staff from Trial to Hp Owner
      const targetLevel =
        getStaffLevel(target);

      if (targetLevel < 0 || targetLevel > 8) {
        return interaction.reply({
          content:
            "❌ يمكنك تعديل نقاط الإدارة من Trial إلى Hp Owner فقط.",
          ephemeral: true
        });
      }

      let current = getPoints(target.id);

      if (interaction.commandName === "addpoints") {
        current += amount;
      } else {
        current -= amount;
      }

      setPoints(target.id, current);

      await updateStaffRank(target);

      const action =
        interaction.commandName === "addpoints"
          ? "إضافة"
          : "إنقاص";

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("⭐ تعديل النقاط")
            .setDescription(
              `تم ${action} النقاط بنجاح.\n\n` +
              `👤 العضو: ${target}\n` +
              `⭐ النقاط الجديدة: **${getPoints(target.id)}**`
            )
        ]
      });
    }

    // ==================================================
    // /ticket-setup
    // OWNER ONLY
    // ==================================================

    if (interaction.commandName === "ticket-setup") {

      if (!isServerOwner(member)) {
        return interaction.reply({
          content:
            "❌ صاحب السيرفر فقط يستطيع إنشاء لوحة التذاكر.",
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🎫 نظام التذاكر")
        .setDescription(
          "اضغط على الزر بالأسفل لفتح تذكرة.\n\n" +
          "سيتم إنشاء تذكرة خاصة بك تلقائيًا.\n" +
          "⚠️ لا يمكنك فتح تذكرة ثانية طالما تذكرتك الحالية مفتوحة."
        )
        .setTimestamp();

      const button =
        new ButtonBuilder()
          .setCustomId("open_ticket")
          .setLabel("فتح تذكرة")
          .setEmoji("🎫")
          .setStyle(ButtonStyle.Primary);

      const row =
        new ActionRowBuilder()
          .addComponents(button);

      return interaction.reply({
        embeds: [embed],
        components: [row]
      });
    }

    // ==================================================
    // MODERATION HIERARCHY
    // ==================================================

    const target =
      interaction.options.getMember("user");

    if (
      ["warn", "kick", "mute", "ban"].includes(
        interaction.commandName
      )
    ) {

      if (!canWarn(member)) {
        return interaction.reply({
          content:
            "❌ تحتاج إلى رتبة Mod أو أعلى لاستخدام أوامر الإدارة.",
          ephemeral: true
        });
      }

      if (!target) {
        return interaction.reply({
          content: "❌ العضو غير موجود.",
          ephemeral: true
        });
      }

      if (target.id === member.id) {
        return interaction.reply({
          content:
            "❌ لا يمكنك استخدام هذا الأمر على نفسك.",
          ephemeral: true
        });
      }

      // Server owner cannot be moderated
      if (isServerOwner(target)) {
        return interaction.reply({
          content:
            "❌ لا يمكن معاقبة صاحب السيرفر.",
          ephemeral: true
        });
      }

      // Staff hierarchy
      const actorLevel =
        getHighestRoleLevel(member);

      const targetLevel =
        getHighestRoleLevel(target);

      if (!isServerOwner(member) &&
          targetLevel >= actorLevel) {

        return interaction.reply({
          content:
            "❌ لا يمكنك معاقبة إداري مساوي أو أعلى منك.",
          ephemeral: true
        });
      }
    }

    // ==================================================
    // /warn
    // ==================================================

    if (interaction.commandName === "warn") {

      const reason =
        interaction.options.getString("reason") ||
        "بدون سبب";

      const warns =
        getWarns(target.id) + 1;

      setWarns(target.id, warns);

      if (warns === 1) {

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xfee75c)
              .setTitle("⚠️ تحذير")
              .setDescription(
                `${target} حصل على **التحذير الأول**.\n\n` +
                `📝 السبب: ${reason}`
              )
          ]
        });

        return;
      }

      // Warn 2 = mute
      if (warns === 2) {

        await target.timeout(
          10 * 60 * 1000,
          reason
        ).catch(() => {});

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xfee75c)
              .setTitle("🔇 التحذير الثاني")
              .setDescription(
                `${target} حصل على التحذير الثاني وتم إعطاؤه **Mute لمدة 10 دقائق**.\n\n` +
                `📝 السبب: ${reason}`
              )
          ]
        });

        return;
      }

      // Warn 3 = kick
      if (warns === 3) {

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xffa500)
              .setTitle("👢 التحذير الثالث")
              .setDescription(
                `${target} حصل على التحذير الثالث وسيتم طرده.\n\n` +
                `📝 السبب: ${reason}`
              )
          ]
        });

        await target.kick(reason).catch(() => {});

        return;
      }

      // Warn 4 = ban 24 hours
      if (warns >= 4) {

        const until =
          Date.now() + BAN_DURATION;

        db.banUntil[target.id] = {
          guildId: guild.id,
          until
        };

        saveDB();

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xed4245)
              .setTitle("🔨 التحذير الرابع")
              .setDescription(
                `${target} حصل على 4 تحذيرات وتم حظره لمدة **24 ساعة**.\n\n` +
                `📝 السبب: ${reason}`
              )
          ]
        });

        await target.ban({
          reason,
          deleteMessageSeconds: 0
        }).catch(() => {});

        return;
      }
    }

    // ==================================================
    // /warnings
    // ==================================================

    if (interaction.commandName === "warnings") {

      const warns =
        getWarns(target.id);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("⚠️ التحذيرات")
            .setDescription(
              `${target}\n\n` +
              `عدد التحذيرات: **${warns}**`
            )
        ]
      });
    }

    // ==================================================
    // /kick
    // ==================================================

    if (interaction.commandName === "kick") {

      const reason =
        interaction.options.getString("reason") ||
        "بدون سبب";

      if (!target.kickable) {
        return interaction.reply({
          content:
            "❌ لا أستطيع طرد هذا العضو. تأكد أن رتبة البوت أعلى من رتبته.",
          ephemeral: true
        });
      }

      await target.kick(reason);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle("👢 Kick")
            .setDescription(
              `تم طرد ${target} بنجاح.\n\n` +
              `📝 السبب: ${reason}`
            )
        ]
      });
    }

    // ==================================================
    // /mute
    // ==================================================

    if (interaction.commandName === "mute") {

      const minutes =
        interaction.options.getInteger("minutes");

      const reason =
        interaction.options.getString("reason") ||
        "بدون سبب";

      if (!target.moderatable) {
        return interaction.reply({
          content:
            "❌ لا أستطيع عمل Mute لهذا العضو. تأكد من صلاحيات البوت وترتيب الرتب.",
          ephemeral: true
        });
      }

      await target.timeout(
        minutes * 60 * 1000,
        reason
      );

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("🔇 Mute")
            .setDescription(
              `تم عمل Mute لـ ${target} لمدة **${minutes} دقيقة**.\n\n` +
              `📝 السبب: ${reason}`
            )
        ]
      });
    }

    // ==================================================
    // /ban
    // ==================================================

    if (interaction.commandName === "ban") {

      const reason =
        interaction.options.getString("reason") ||
        "بدون سبب";

      if (!target.bannable) {
        return interaction.reply({
          content:
            "❌ لا أستطيع حظر هذا العضو. تأكد أن رتبة البوت أعلى من رتبته.",
          ephemeral: true
        });
      }

      await target.ban({
        reason,
        deleteMessageSeconds: 0
      });

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🔨 Ban")
            .setDescription(
              `تم حظر ${target} بنجاح.\n\n` +
              `📝 السبب: ${reason}`
            )
        ]
      });
    }

  } catch (error) {

    console.log(
      "❌ Interaction Error:",
      error
    );

    if (!interaction.replied &&
        !interaction.deferred) {

      await interaction.reply({
        content:
          "❌ حدث خطأ أثناء تنفيذ الأمر.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ======================================================
//             EXPIRED 24H BANS
// ======================================================

async function checkExpiredBans() {

  const now = Date.now();

  for (const [userId, info] of Object.entries(db.banUntil)) {

    if (now < info.until) continue;

    try {

      const guild =
        client.guilds.cache.get(info.guildId);

      if (guild) {
        await guild.members.unban(
          userId,
          "24h ban expired"
        ).catch(() => {});
      }

    } catch (error) {
      console.log(
        "❌ Unban error:",
        error.message
      );
    }

    delete db.banUntil[userId];

    // Reset warnings after 24h
    delete db.warns[userId];

    saveDB();
  }
}

// Check expired bans every minute
setInterval(() => {
  checkExpiredBans().catch(() => {});
}, 60 * 1000);

// ======================================================
//                    ERRORS
// ======================================================

client.on("error", error => {
  console.log("❌ Discord Client Error:", error);
});

process.on("unhandledRejection", error => {
  console.log("❌ Unhandled Rejection:", error);
});

process.on("uncaughtException", error => {
  console.log("❌ Uncaught Exception:", error);
});

// ======================================================
//                    ENV CHECK
// ======================================================

if (!TOKEN) {
  console.log("❌ TOKEN غير موجود في Railway Variables");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.log("❌ CLIENT_ID غير موجود في Railway Variables");
  process.exit(1);
}

// ======================================================
//                    LOGIN
// ======================================================

client.login(TOKEN);
