require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const fs = require("fs");

// ======================================================
//                  CONFIG
// ======================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || "";

const WELCOME_CHANNEL_ID = "1529047234056949780";

const SERVER_IP = "JAFA: Coper-_-crfte.aternos.me";
const SERVER_PORT = "31246";

const PLAYER_ROLE_NAME = "player";

// ======================================================
//                  STAFF RANKS
// ======================================================

const STAFF_RANKS = [
  { name: "Trial", points: 0 },
  { name: "Helper", points: 100 },
  { name: "Sr Helper", points: 200 },
  { name: "Mod", points: 300 },
  { name: "Sr Mod", points: 400 },
  { name: "Jr Admin", points: 500 },
  { name: "Admin", points: 600 },
  { name: "Co Owner", points: 700 },
  { name: "Hp Owner", points: 800 },
  { name: "Owner", points: 900 }
];

// ======================================================
//                  STAFF ROLES
// ======================================================

const STAFF_ROLE_NAMES = STAFF_RANKS.map(rank => rank.name);

// ======================================================
//                  MODERATION RANK
// ======================================================

const MOD_RANK_INDEX = 3; // Mod

// ======================================================
//                  DATABASE
// ======================================================

const DB_FILE = "./database.json";

let db = {
  points: {},
  warns: {},
  tickets: {},
  spam: {},
  pointCooldown: {},
  banUntil: {}
};

if (fs.existsSync(DB_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));

    db = {
      ...db,
      ...saved
    };
  } catch (error) {
    console.log("❌ تعذر قراءة database.json");
  }
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ======================================================
//                  CLIENT
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
    Partials.Message,
    Partials.GuildMember
  ]
});

// ======================================================
//                  HELPERS
// ======================================================

function getStaffRankIndex(member) {
  if (!member) return -1;

  let highest = -1;

  for (let i = 0; i < STAFF_ROLE_NAMES.length; i++) {
    const role = member.guild.roles.cache.find(
      r => r.name === STAFF_ROLE_NAMES[i]
    );

    if (role && member.roles.cache.has(role.id)) {
      highest = Math.max(highest, i);
    }
  }

  return highest;
}

function getStaffRank(member) {
  const index = getStaffRankIndex(member);

  if (index === -1) return null;

  return STAFF_RANKS[index];
}

function isStaff(member) {
  return getStaffRankIndex(member) !== -1;
}

function isModOrHigher(member) {
  return getStaffRankIndex(member) >= MOD_RANK_INDEX;
}

function getPoints(userId) {
  return Number(db.points[userId] || 0);
}

function setPoints(userId, amount) {
  db.points[userId] = Math.max(0, Number(amount));
  saveDB();
}

function getWarns(userId) {
  return Number(db.warns[userId] || 0);
}

function setWarns(userId, amount) {
  db.warns[userId] = Math.max(0, Number(amount));
  saveDB();
}

// ======================================================
//                  GET / CREATE ROLES
// ======================================================

async function getOrCreateRole(guild, roleName) {
  let role = guild.roles.cache.find(
    r => r.name === roleName
  );

  if (!role) {
    role = await guild.roles.create({
      name: roleName,
      reason: "Pro-Altra-Bot automatic role setup"
    });

    console.log(`✅ تم إنشاء رتبة: ${roleName}`);
  }

  return role;
}

// ======================================================
//                  SETUP ROLES
// ======================================================

async function setupRoles(guild) {
  for (const rank of STAFF_RANKS) {
    await getOrCreateRole(guild, rank.name);
  }

  await getOrCreateRole(guild, PLAYER_ROLE_NAME);
}

// ======================================================
//                  AUTO PROMOTION
// ======================================================

async function updateStaffRank(member) {
  if (!member || !member.guild) return;

  const points = getPoints(member.id);

  let newRankIndex = 0;

  for (let i = 0; i < STAFF_RANKS.length; i++) {
    if (points >= STAFF_RANKS[i].points) {
      newRankIndex = i;
    }
  }

  const newRank = STAFF_RANKS[newRankIndex];

  // إذا كان الشخص ليس Staff فلا نعطيه Trial تلقائيًا
  // إلا إذا كان لديه Staff role بالفعل.
  if (!isStaff(member)) return;

  const rolesToRemove = [];

  for (const rank of STAFF_RANKS) {
    const role = member.guild.roles.cache.find(
      r => r.name === rank.name
    );

    if (role && member.roles.cache.has(role.id)) {
      rolesToRemove.push(role);
    }
  }

  if (rolesToRemove.length > 0) {
    try {
      await member.roles.remove(rolesToRemove);
    } catch (error) {
      console.log("❌ فشل إزالة رتبة Staff القديمة:", error.message);
    }
  }

  const newRole = member.guild.roles.cache.find(
    r => r.name === newRank.name
  );

  if (newRole) {
    try {
      await member.roles.add(newRole);
    } catch (error) {
      console.log("❌ فشل إعطاء الرتبة الجديدة:", error.message);
    }
  }
}

// ======================================================
//                  READY
// ======================================================

client.once("ready", async () => {
  console.log("======================================");
  console.log(`🤖 Logged in as ${client.user.tag}`);
  console.log("======================================");

  try {
    for (const guild of client.guilds.cache.values()) {
      await setupRoles(guild);
    }
  } catch (error) {
    console.log("❌ خطأ في تجهيز الرتب:", error);
  }

  console.log("✅ البوت Online");
});

// ======================================================
//                  JOIN / WELCOME
// ======================================================

client.on("guildMemberAdd", async member => {
  try {
    // ----------------------------------------------
    // إعطاء رتبة player
    // ----------------------------------------------

    const playerRole = member.guild.roles.cache.find(
      role => role.name === PLAYER_ROLE_NAME
    );

    if (playerRole) {
      try {
        await member.roles.add(playerRole);
      } catch (error) {
        console.log(
          "❌ لم أستطع إعطاء رتبة player:",
          error.message
        );
      }
    }

    // ----------------------------------------------
    // قناة الترحيب
    // ----------------------------------------------

    const welcomeChannel =
      member.guild.channels.cache.get(WELCOME_CHANNEL_ID);

    if (!welcomeChannel) {
      console.log("❌ قناة الترحيب غير موجودة");
      return;
    }

    // ----------------------------------------------
    // رسالة الترحيب
    // ----------------------------------------------

    const welcomeEmbed = new EmbedBuilder()
      .setDescription(
        `🌟 | مرحباً بك <@${member.id}>\n\n` +
        `🎊 سعداء بانضمامك إلى سيرفر 𝐂𝐎𝐏𝐄𝐑𝐂𝐑𝐅𝐓𝐄\n\n` +
        `🚀 استمتع بالفعاليات والتحديات\n` +
        `📖 لا تنسَ الاطلاع على القوانين\n\n` +
        `✨ نتمنى لك إقامة ممتعة بيننا`
      )
      .setColor(0x5865F2)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

    await welcomeChannel.send({
      embeds: [welcomeEmbed]
    });

    console.log(
      `👋 عضو جديد: ${member.user.tag}`
    );

  } catch (error) {
    console.log(
      "❌ خطأ في الترحيب:",
      error
    );
  }
});

// ======================================================
//                  SLASH COMMANDS
// ======================================================

const commands = [

  // /ip
  new SlashCommandBuilder()
    .setName("ip")
    .setDescription("عرض IP السيرفر"),

  // /points
  new SlashCommandBuilder()
    .setName("points")
    .setDescription("عرض نقاطك"),

  // /rank
  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("عرض رتبتك ونقاطك"),

  // /addpoints
  new SlashCommandBuilder()
    .setName("addpoints")
    .setDescription("إضافة نقاط لعضو Staff")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("عدد النقاط")
        .setMinValue(1)
        .setRequired(true)
    ),

  // /removepoints
  new SlashCommandBuilder()
    .setName("removepoints")
    .setDescription("إزالة نقاط من عضو Staff")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("عدد النقاط")
        .setMinValue(1)
        .setRequired(true)
    ),

  // /warn
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

  // /warnings
  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("عرض تحذيرات عضو")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    ),

  // /kick
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
        .setDescription("سبب الطرد")
        .setRequired(false)
    ),

  // /mute
  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("عمل Timeout لعضو")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("المدة بالدقائق")
        .setMinValue(1)
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("السبب")
        .setRequired(false)
    ),

  // /ban
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("حظر عضو لمدة 24 ساعة")
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

  // /ticket-setup
  new SlashCommandBuilder()
    .setName("ticket-setup")
    .setDescription("إنشاء لوحة التذاكر"),

].map(command => command.toJSON());

// ======================================================
//                  REGISTER COMMANDS
// ======================================================

async function registerCommands() {
  try {
    const rest = new REST({ version: "10" })
      .setToken(TOKEN);

    console.log("⏳ جاري تسجيل الأوامر...");

    if (GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(
          CLIENT_ID,
          GUILD_ID
        ),
        {
          body: commands
        }
      );

      console.log("✅ تم تسجيل الأوامر في السيرفر");
    } else {
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        {
          body: commands
        }
      );

      console.log("✅ تم تسجيل الأوامر Global");
    }

  } catch (error) {
    console.log(
      "❌ خطأ في تسجيل الأوامر:",
      error
    );
  }
}

// ======================================================
//                  INTERACTIONS
// ======================================================

client.on("interactionCreate", async interaction => {

  try {

    // ==================================================
    //                  SLASH COMMANDS
    // ==================================================

    if (interaction.isChatInputCommand()) {

      const command = interaction.commandName;

      // -----------------------------------------------
      // /ip
      // -----------------------------------------------

      if (command === "ip") {

        const embed = new EmbedBuilder()
          .setTitle("🌐 Server IP")
          .setDescription(
            `**IP:**\n\`${SERVER_IP}\`\n\n` +
            `**Port:**\n\`${SERVER_PORT}\``
          )
          .setColor(0x5865F2);

        return interaction.reply({
          embeds: [embed]
        });
      }

      // -----------------------------------------------
      // /points
      // -----------------------------------------------

      if (command === "points") {

        const member = interaction.member;

        if (!isStaff(member)) {
          return interaction.reply({
            content: "❌ هذا الأمر خاص بالـ Staff فقط.",
            ephemeral: true
          });
        }

        const points = getPoints(member.id);
        const rank = getStaffRank(member);

        return interaction.reply({
          content:
            `⭐ نقاطك: **${points}**\n` +
            `🏅 رتبتك: **${rank ? rank.name : "غير معروف"}**`
        });
      }

      // -----------------------------------------------
      // /rank
      // -----------------------------------------------

      if (command === "rank") {

        const member = interaction.member;

        if (!isStaff(member)) {
          return interaction.reply({
            content: "❌ أنت لست من الـ Staff.",
            ephemeral: true
          });
        }

        const points = getPoints(member.id);
        const rankIndex = getStaffRankIndex(member);
        const rank = STAFF_RANKS[rankIndex];

        const nextRank =
          STAFF_RANKS[rankIndex + 1];

        let nextText = "🏆 وصلت لأعلى رتبة.";

        if (nextRank) {
          const remaining =
            Math.max(
              0,
              nextRank.points - points
            );

          nextText =
            `📈 تحتاج **${remaining}** نقطة للترقية إلى **${nextRank.name}**`;
        }

        const embed = new EmbedBuilder()
          .setTitle("📊 Staff Rank")
          .setDescription(
            `👤 العضو: ${member}\n\n` +
            `🏅 الرتبة: **${rank.name}**\n` +
            `⭐ النقاط: **${points}**\n\n` +
            `${nextText}`
          )
          .setColor(0x5865F2);

        return interaction.reply({
          embeds: [embed]
        });
      }

      // -----------------------------------------------
      // /addpoints
      // -----------------------------------------------

      if (command === "addpoints") {

        if (!interaction.guild) return;

        if (interaction.guild.ownerId !== interaction.user.id) {
          return interaction.reply({
            content: "❌ هذا الأمر للـ Owner فقط.",
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

        if (target.id === interaction.user.id) {
          return interaction.reply({
            content: "❌ لا يمكنك إعطاء نفسك نقاط.",
            ephemeral: true
          });
        }

        if (!isStaff(target)) {
          return interaction.reply({
            content: "❌ هذا العضو ليس Staff.",
            ephemeral: true
          });
        }

        const oldPoints = getPoints(target.id);

        setPoints(
          target.id,
          oldPoints + amount
        );

        await updateStaffRank(target);

        return interaction.reply({
          content:
            `✅ تم إضافة **${amount}** نقطة إلى ${target}.\n` +
            `⭐ النقاط الآن: **${getPoints(target.id)}**`
        });
      }

      // -----------------------------------------------
      // /removepoints
      // -----------------------------------------------

      if (command === "removepoints") {

        if (!interaction.guild) return;

        if (interaction.guild.ownerId !== interaction.user.id) {
          return interaction.reply({
            content: "❌ هذا الأمر للـ Owner فقط.",
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

        if (target.id === interaction.user.id) {
          return interaction.reply({
            content: "❌ لا يمكنك إزالة نقاط من نفسك.",
            ephemeral: true
          });
        }

        if (!isStaff(target)) {
          return interaction.reply({
            content: "❌ هذا العضو ليس Staff.",
            ephemeral: true
          });
        }

        const oldPoints = getPoints(target.id);

        setPoints(
          target.id,
          Math.max(0, oldPoints - amount)
        );

        await updateStaffRank(target);

        return interaction.reply({
          content:
            `✅ تم إزالة **${amount}** نقطة من ${target}.\n` +
            `⭐ النقاط الآن: **${getPoints(target.id)}**`
        });
      }

      // -----------------------------------------------
      // /warn
      // -----------------------------------------------

      if (command === "warn") {

        if (!interaction.guild) return;

        if (!isModOrHigher(interaction.member)) {
          return interaction.reply({
            content: "❌ تحتاج رتبة **Mod** أو أعلى.",
            ephemeral: true
          });
        }

        const target =
          interaction.options.getMember("user");

        const reason =
          interaction.options.getString("reason") ||
          "بدون سبب";

        if (!target) {
          return interaction.reply({
            content: "❌ العضو غير موجود.",
            ephemeral: true
          });
        }

        // Server Owner protection
        if (
          target.id === interaction.guild.ownerId
        ) {
          return interaction.reply({
            content: "❌ لا يمكن معاقبة Server Owner.",
            ephemeral: true
          });
        }

        // Hierarchy protection
        const executorRank =
          getStaffRankIndex(interaction.member);

        const targetRank =
          getStaffRankIndex(target);

        if (
          targetRank !== -1 &&
          targetRank >= executorRank
        ) {
          return interaction.reply({
            content:
              "❌ لا يمكنك معاقبة شخص رتبته مساوية أو أعلى منك.",
            ephemeral: true
          });
        }

        const warns = getWarns(target.id) + 1;

        setWarns(target.id, warns);

        let actionText = "⚠️ Warning";

        // Warn 2 = mute
        if (warns === 2) {

          if (target.moderatable) {
            await target.timeout(
              10 * 60 * 1000,
              reason
            );

            actionText =
              "🔇 تم عمل Timeout لمدة 10 دقائق.";
          } else {
            actionText =
              "⚠️ تم تسجيل التحذير، لكن لا أستطيع عمل Timeout.";
          }
        }

        // Warn 3 = kick
        if (warns === 3) {

          if (target.kickable) {
            await target.kick(reason);

            actionText =
              "👢 تم طرد العضو.";
          } else {
            actionText =
              "⚠️ تم تسجيل التحذير، لكن لا أستطيع طرد العضو.";
          }
        }

        // Warn 4 = ban 24 hours
        if (warns >= 4) {

          try {

            await target.ban({
              reason: reason
            });

            db.banUntil[target.id] =
              Date.now() +
              24 * 60 * 60 * 1000;

            setWarns(target.id, 0);
            saveDB();

            actionText =
              "🔨 تم حظر العضو لمدة 24 ساعة.";

          } catch (error) {

            actionText =
              "⚠️ تم تسجيل التحذير، لكن لم أستطع حظر العضو.";
          }
        }

        const embed = new EmbedBuilder()
          .setTitle("⚠️ Warning")
          .setDescription(
            `👤 العضو: ${target}\n` +
            `📝 السبب: **${reason}**\n` +
            `⚠️ عدد التحذيرات: **${warns >= 4 ? 0 : warns}**\n\n` +
            `${actionText}`
          )
          .setColor(0xF1C40F);

        return interaction.reply({
          embeds: [embed]
        });
      }

      // -----------------------------------------------
      // /warnings
      // -----------------------------------------------

      if (command === "warnings") {

        const target =
          interaction.options.getMember("user");

        if (!target) {
          return interaction.reply({
            content: "❌ العضو غير موجود.",
            ephemeral: true
          });
        }

        const warns = getWarns(target.id);

        return interaction.reply({
          content:
            `⚠️ تحذيرات ${target}: **${warns}**`
        });
      }

      // -----------------------------------------------
      // /kick
      // -----------------------------------------------

      if (command === "kick") {

        if (!isModOrHigher(interaction.member)) {
          return interaction.reply({
            content: "❌ تحتاج رتبة **Mod** أو أعلى.",
            ephemeral: true
          });
        }

        const target =
          interaction.options.getMember("user");

        const reason =
          interaction.options.getString("reason") ||
          "بدون سبب";

        if (!target) {
          return interaction.reply({
            content: "❌ العضو غير موجود.",
            ephemeral: true
          });
        }

        if (
          target.id === interaction.guild.ownerId
        ) {
          return interaction.reply({
            content: "❌ لا يمكن طرد Server Owner.",
            ephemeral: true
          });
        }

        const executorRank =
          getStaffRankIndex(interaction.member);

        const targetRank =
          getStaffRankIndex(target);

        if (
          targetRank !== -1 &&
          targetRank >= executorRank
        ) {
          return interaction.reply({
            content:
              "❌ لا يمكنك طرد شخص رتبته مساوية أو أعلى منك.",
            ephemeral: true
          });
        }

        if (!target.kickable) {
          return interaction.reply({
            content:
              "❌ البوت لا يستطيع طرد هذا العضو. تأكد أن رتبة البوت أعلى منه.",
            ephemeral: true
          });
        }

        await target.kick(reason);

        return interaction.reply({
          content:
            `👢 تم طرد ${target.user.tag}\n` +
            `📝 السبب: ${reason}`
        });
      }

      // -----------------------------------------------
      // /mute
      // -----------------------------------------------

      if (command === "mute") {

        if (!isModOrHigher(interaction.member)) {
          return interaction.reply({
            content: "❌ تحتاج رتبة **Mod** أو أعلى.",
            ephemeral: true
          });
        }

        const target =
          interaction.options.getMember("user");

        const minutes =
          interaction.options.getInteger("minutes") || 10;

        const reason =
          interaction.options.getString("reason") ||
          "بدون سبب";

        if (!target) {
          return interaction.reply({
            content: "❌ العضو غير موجود.",
            ephemeral: true
          });
        }

        if (
          target.id === interaction.guild.ownerId
        ) {
          return interaction.reply({
            content: "❌ لا يمكن عمل Timeout للـ Owner.",
            ephemeral: true
          });
        }

        const executorRank =
          getStaffRankIndex(interaction.member);

        const targetRank =
          getStaffRankIndex(target);

        if (
          targetRank !== -1 &&
          targetRank >= executorRank
        ) {
          return interaction.reply({
            content:
              "❌ لا يمكنك عمل Timeout لشخص رتبته مساوية أو أعلى منك.",
            ephemeral: true
          });
        }

        if (!target.moderatable) {
          return interaction.reply({
            content:
              "❌ البوت لا يستطيع عمل Timeout لهذا العضو.",
            ephemeral: true
          });
        }

        await target.timeout(
          minutes * 60 * 1000,
          reason
        );

        return interaction.reply({
          content:
            `🔇 تم عمل Timeout لـ ${target}\n` +
            `⏱️ المدة: **${minutes} دقيقة**\n` +
            `📝 السبب: ${reason}`
        });
      }

      // -----------------------------------------------
      // /ban
      // -----------------------------------------------

      if (command === "ban") {

        if (!isModOrHigher(interaction.member)) {
          return interaction.reply({
            content: "❌ تحتاج رتبة **Mod** أو أعلى.",
            ephemeral: true
          });
        }

        const target =
          interaction.options.getMember("user");

        const reason =
          interaction.options.getString("reason") ||
          "بدون سبب";

        if (!target) {
          return interaction.reply({
            content: "❌ العضو غير موجود.",
            ephemeral: true
          });
        }

        if (
          target.id === interaction.guild.ownerId
        ) {
          return interaction.reply({
            content: "❌ لا يمكن حظر Server Owner.",
            ephemeral: true
          });
        }

        const executorRank =
          getStaffRankIndex(interaction.member);

        const targetRank =
          getStaffRankIndex(target);

        if (
          targetRank !== -1 &&
          targetRank >= executorRank
        ) {
          return interaction.reply({
            content:
              "❌ لا يمكنك حظر شخص رتبته مساوية أو أعلى منك.",
            ephemeral: true
          });
        }

        if (!target.bannable) {
          return interaction.reply({
            content:
              "❌ البوت لا يستطيع حظر هذا العضو.",
            ephemeral: true
          });
        }

        await target.ban({
          reason
        });

        db.banUntil[target.id] =
          Date.now() +
          24 * 60 * 60 * 1000;

        saveDB();

        return interaction.reply({
          content:
            `🔨 تم حظر ${target.user.tag} لمدة **24 ساعة**.\n` +
            `📝 السبب: ${reason}`
        });
      }

      // -----------------------------------------------
      // /ticket-setup
      // -----------------------------------------------

      if (command === "ticket-setup") {

        if (
          interaction.guild.ownerId !==
          interaction.user.id
        ) {
          return interaction.reply({
            content:
              "❌ فقط Server Owner يستطيع إنشاء لوحة التذاكر.",
            ephemeral: true
          });
        }

        const embed = new EmbedBuilder()
          .setTitle("🎫 الدعم الفني")
          .setDescription(
            "اضغط على الزر بالأسفل لفتح تذكرة.\n\n" +
            "📌 يمكنك فتح تذكرة واحدة فقط في نفس الوقت."
          )
          .setColor(0x5865F2);

        const button =
          new ButtonBuilder()
            .setCustomId("open_ticket")
            .setLabel("فتح تذكرة")
            .setEmoji("🎫")
            .setStyle(ButtonStyle.Primary);

        const row =
          new ActionRowBuilder()
            .addComponents(button);

        await interaction.channel.send({
          embeds: [embed],
          components: [row]
        });

        return interaction.reply({
          content: "✅ تم إنشاء لوحة التذاكر.",
          ephemeral: true
        });
      }
    }

    // ==================================================
    //                  OPEN TICKET
    // ==================================================

    if (
      interaction.isButton() &&
      interaction.customId === "open_ticket"
    ) {

      const guild = interaction.guild;
      const user = interaction.user;

      // -----------------------------------------------
      // هل لديه تذكرة مفتوحة؟
      // -----------------------------------------------

      const oldTicket =
        db.tickets[user.id];

      if (oldTicket) {

        const existingChannel =
          guild.channels.cache.get(
            oldTicket.channelId
          );

        if (existingChannel) {
          return interaction.reply({
            content:
              `❌ لديك تذكرة مفتوحة بالفعل: ${existingChannel}`,
            ephemeral: true
          });
        }

        delete db.tickets[user.id];
        saveDB();
      }

      // -----------------------------------------------
      // Staff roles
      // -----------------------------------------------

      const staffRoles = [];

      for (const rank of STAFF_RANKS) {

        const role =
          guild.roles.cache.find(
            r => r.name === rank.name
          );

        if (role) {
          staffRoles.push(role);
        }
      }

      // -----------------------------------------------
      // Ticket channel
      // -----------------------------------------------

      const channel =
        await guild.channels.create({
          name:
            `ticket-${user.username}`
              .toLowerCase()
              .replace(/[^a-z0-9-_]/g, "")
              .slice(0, 80),

          type: ChannelType.GuildText,

          permissionOverwrites: [

            // Everyone
            {
              id: guild.roles.everyone.id,
              deny: [
                PermissionsBitField.Flags.ViewChannel
              ]
            },

            // Ticket owner
            {
              id: user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
              ]
            },

            // Staff
            ...staffRoles.map(role => ({
              id: role.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
              ]
            }))
          ]
        });

      // -----------------------------------------------
      // Save ticket
      // -----------------------------------------------

      db.tickets[user.id] = {
        channelId: channel.id,
        createdAt: Date.now()
      };

      saveDB();

      // -----------------------------------------------
      // Close button
      // -----------------------------------------------

      const closeButton =
        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("إغلاق التذكرة")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Danger);

      const row =
        new ActionRowBuilder()
          .addComponents(closeButton);

      const ticketEmbed =
        new EmbedBuilder()
          .setTitle("🎫 تذكرتك")
          .setDescription(
            `أهلاً ${user} 👋\n\n` +
            `اكتب مشكلتك هنا وسيقوم فريق الإدارة بمساعدتك.\n\n` +
            `🔒 إغلاق التذكرة متاح للـ Server Owner فقط.`
          )
          .setColor(0x5865F2);

      await channel.send({
        content: `${user}`,
        embeds: [ticketEmbed],
        components: [row]
      });

      return interaction.reply({
        content:
          `✅ تم فتح تذكرتك: ${channel}`,
        ephemeral: true
      });
    }

    // ==================================================
    //                  CLOSE TICKET
    // ==================================================

    if (
      interaction.isButton() &&
      interaction.customId === "close_ticket"
    ) {

      if (
        interaction.guild.ownerId !==
        interaction.user.id
      ) {
        return interaction.reply({
          content:
            "❌ فقط Server Owner يستطيع إغلاق التذكرة.",
          ephemeral: true
        });
      }

      const ticketEntry =
        Object.entries(db.tickets).find(
          ([userId, ticket]) =>
            ticket.channelId === interaction.channel.id
        );

      if (ticketEntry) {
        const [userId] = ticketEntry;

        delete db.tickets[userId];

        saveDB();
      }

      await interaction.reply({
        content:
          "🔒 سيتم إغلاق التذكرة خلال 3 ثواني..."
      });

      setTimeout(async () => {

        try {
          await interaction.channel.delete();
        } catch (error) {
          console.log(
            "❌ لم أستطع حذف التذكرة:",
            error.message
          );
        }

      }, 3000);
    }

  } catch (error) {

    console.log(
      "❌ Interaction Error:",
      error
    );

    if (!interaction.replied && !interaction.deferred) {

      try {
        await interaction.reply({
          content:
            "❌ حدث خطأ أثناء تنفيذ الأمر.",
          ephemeral: true
        });
      } catch {}
    }
  }
});

// ======================================================
//                  MESSAGE SYSTEM
// ======================================================

client.on("messageCreate", async message => {

  try {

    if (message.author.bot) return;
    if (!message.guild) return;

    // ==================================================
    //                  IP AUTO RESPONSE
    // ==================================================

    if (
      message.content
        .trim()
        .toLowerCase() === "ip"
    ) {

      const embed = new EmbedBuilder()
        .setTitle("🌐 CoperCraft Server")
        .setDescription(
          `**IP:**\n\`${SERVER_IP}\`\n\n` +
          `**Port:**\n\`${SERVER_PORT}\``
        )
        .setColor(0x5865F2);

      await message.reply({
        embeds: [embed]
      });
    }

    // ==================================================
    //                  SPAM PROTECTION
    // ==================================================

    // Owner bypass
    if (
      message.guild.ownerId !==
      message.author.id
    ) {

      const now = Date.now();

      const lastMessage =
        Number(db.spam[message.author.id] || 0);

      const difference =
        now - lastMessage;

      if (difference < 10000) {

        try {
          await message.delete();
        } catch {}

        return;
      }

      db.spam[message.author.id] = now;

      saveDB();
    }

    // ==================================================
    //                  STAFF POINTS
    // ==================================================

    const member =
      message.member;

    if (member && isStaff(member)) {

      const now = Date.now();

      const lastPoint =
        Number(
          db.pointCooldown[member.id] || 0
        );

      // نقطة كل 60 ثانية
      if (
        now - lastPoint >=
        60 * 1000
      ) {

        const current =
          getPoints(member.id);

        setPoints(
          member.id,
          current + 1
        );

        db.pointCooldown[member.id] =
          now;

        saveDB();

        await updateStaffRank(member);
      }
    }

  } catch (error) {

    console.log(
      "❌ Message Error:",
      error
    );
  }
});

// ======================================================
//                  AUTO UNBAN
// ======================================================

async function checkExpiredBans() {

  const now = Date.now();

  for (
    const [userId, banTime]
    of Object.entries(db.banUntil)
  ) {

    if (now >= banTime) {

      for (
        const guild
        of client.guilds.cache.values()
      ) {

        try {

          await guild.bans.remove(
            userId,
            "انتهاء مدة الحظر 24 ساعة"
          );

          console.log(
            `🔓 تم فك حظر ${userId}`
          );

        } catch {}
      }

      delete db.banUntil[userId];

      setWarns(userId, 0);
    }
  }

  saveDB();
}

// ======================================================
//                  ERRORS
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
//                  START
// ======================================================

async function startBot() {

  if (!TOKEN) {
    console.log("❌ TOKEN غير موجود في Railway Variables");
    return;
  }

  if (!CLIENT_ID) {
    console.log("❌ CLIENT_ID غير موجود في Railway Variables");
    return;
  }

  await registerCommands();

  await client.login(TOKEN);
}

startBot();

// فحص الحظر كل دقيقة
setInterval(() => {
  checkExpiredBans();
}, 60 * 1000);
