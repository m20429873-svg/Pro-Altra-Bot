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
//                       CONFIG
// ======================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || "";

const WELCOME_CHANNEL_ID = "1529047234056949780";

const SERVER_IP = "JAFA: Coper-_-crfte.aternos.me";
const SERVER_PORT = "31246";

const PLAYER_ROLE_NAME = "player";
const KING_ROLE_NAME = "King";

// ======================================================
//                     STAFF RANKS
// ======================================================
//
// النظام:
// Trial يحتاج 100 نقطة للترقية إلى Helper
// Helper يحتاج 200 نقطة للترقية إلى Sr Helper
// Sr Helper يحتاج 300 نقطة للترقية إلى Mod
// وهكذا.
//
// بعد الترقية:
// النقاط = 0
//
// Owner:
// يتوقف عنده نظام النقاط والترقيات
//

const STAFF_RANKS = [
  { name: "Trial", nextPoints: 100 },
  { name: "Helper", nextPoints: 200 },
  { name: "Sr Helper", nextPoints: 300 },
  { name: "Mod", nextPoints: 400 },
  { name: "Sr Mod", nextPoints: 500 },
  { name: "Jr Admin", nextPoints: 600 },
  { name: "Admin", nextPoints: 700 },
  { name: "Co Owner", nextPoints: 800 },
  { name: "Hp Owner", nextPoints: 900 },
  { name: "Owner", nextPoints: null }
];

const STAFF_ROLE_NAMES = STAFF_RANKS.map(rank => rank.name);

// Mod = index 3
const MOD_RANK_INDEX = 3;

// ======================================================
//                     DATABASE
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
    const saved = JSON.parse(
      fs.readFileSync(DB_FILE, "utf8")
    );

    db = {
      ...db,
      ...saved
    };

  } catch (error) {
    console.log("❌ تعذر قراءة database.json");
  }
}

function saveDB() {
  try {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch (error) {
    console.log("❌ فشل حفظ database.json:", error.message);
  }
}

// ======================================================
//                       CLIENT
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
//                       HELPERS
// ======================================================

function getRoleByName(guild, name) {
  return guild.roles.cache.find(
    role => role.name.toLowerCase() === name.toLowerCase()
  );
}

function getStaffRankIndex(member) {

  if (!member) return -1;

  let highest = -1;

  for (let i = 0; i < STAFF_ROLE_NAMES.length; i++) {

    const role = getRoleByName(
      member.guild,
      STAFF_ROLE_NAMES[i]
    );

    if (
      role &&
      member.roles.cache.has(role.id)
    ) {
      highest = Math.max(highest, i);
    }
  }

  return highest;
}

function getStaffRank(member) {

  const index = getStaffRankIndex(member);

  if (index === -1) {
    return null;
  }

  return STAFF_RANKS[index];
}

function isStaff(member) {
  return getStaffRankIndex(member) !== -1;
}

function isTrialToSrHelper(member) {

  const index = getStaffRankIndex(member);

  return index >= 0 && index <= 2;
}

function isModOrHigher(member) {

  const index = getStaffRankIndex(member);

  return index >= MOD_RANK_INDEX;
}

function isOwnerRank(member) {

  return getStaffRankIndex(member) === STAFF_RANK_NAMES.length - 1;
}

function getPoints(userId) {
  return Number(db.points[userId] || 0);
}

function setPoints(userId, amount) {

  db.points[userId] = Math.max(
    0,
    Number(amount)
  );

  saveDB();
}

function addPoints(userId, amount) {

  const current = getPoints(userId);

  db.points[userId] =
    Math.max(0, current + Number(amount));

  saveDB();

  return db.points[userId];
}

function removePoints(userId, amount) {

  const current = getPoints(userId);

  db.points[userId] =
    Math.max(0, current - Number(amount));

  saveDB();

  return db.points[userId];
}

function getWarns(userId) {
  return Number(db.warns[userId] || 0);
}

function setWarns(userId, amount) {

  db.warns[userId] =
    Math.max(0, Number(amount));

  saveDB();
}

// ======================================================
//                 GET / CREATE ROLES
// ======================================================

async function getOrCreateRole(guild, roleName) {

  let role = getRoleByName(
    guild,
    roleName
  );

  if (!role) {

    role = await guild.roles.create({
      name: roleName,
      reason: "CoperCraft automatic role setup"
    });

    console.log(
      `✅ تم إنشاء رتبة: ${roleName}`
    );
  }

  return role;
}

// ======================================================
//                     SETUP ROLES
// ======================================================

async function setupRoles(guild) {

  // Staff
  for (const rank of STAFF_RANKS) {

    await getOrCreateRole(
      guild,
      rank.name
    );
  }

  // Player
  await getOrCreateRole(
    guild,
    PLAYER_ROLE_NAME
  );

  // King
  await getOrCreateRole(
    guild,
    KING_ROLE_NAME
  );
}

// ======================================================
//                   PROMOTION SYSTEM
// ======================================================

async function updateStaffRank(member) {

  if (!member || !member.guild) {
    return;
  }

  const currentIndex =
    getStaffRankIndex(member);

  // ليس Staff
  if (currentIndex === -1) {
    return;
  }

  // Owner - النظام يتوقف
  if (
    currentIndex ===
    STAFF_RANKS.length - 1
  ) {

    if (getPoints(member.id) !== 0) {
      setPoints(member.id, 0);
    }

    return;
  }

  const currentRank =
    STAFF_RANKS[currentIndex];

  const points =
    getPoints(member.id);

  // لم يصل للنقاط المطلوبة
  if (
    currentRank.nextPoints === null ||
    points < currentRank.nextPoints
  ) {
    return;
  }

  // الرتبة التالية
  const nextIndex =
    currentIndex + 1;

  const nextRank =
    STAFF_RANKS[nextIndex];

  if (!nextRank) {
    return;
  }

  const oldRole =
    getRoleByName(
      member.guild,
      currentRank.name
    );

  const newRole =
    getRoleByName(
      member.guild,
      nextRank.name
    );

  try {

    // إزالة الرتبة القديمة
    if (oldRole) {
      await member.roles.remove(
        oldRole
      );
    }

    // إضافة الرتبة الجديدة
    if (newRole) {
      await member.roles.add(
        newRole
      );
    }

    // تصفير النقاط بعد الترقية
    setPoints(
      member.id,
      0
    );

    console.log(
      `⬆️ ${member.user.tag} ترقى من ${currentRank.name} إلى ${nextRank.name}`
    );

    // إرسال رسالة للعضو إذا أمكن
    try {

      await member.send(
        `🎉 مبروك!\n\n` +
        `تمت ترقيتك من **${currentRank.name}** إلى **${nextRank.name}**.\n` +
        `⭐ تم تصفير نقاطك وبدأت تجمع للترقية القادمة.`
      );

    } catch {}

  } catch (error) {

    console.log(
      "❌ خطأ في الترقية:",
      error.message
    );
  }
}

// ======================================================
//                       READY
// ======================================================

client.once("ready", async () => {

  console.log(
    "======================================"
  );

  console.log(
    `🤖 Logged in as ${client.user.tag}`
  );

  console.log(
    "======================================"
  );

  try {

    for (
      const guild
      of client.guilds.cache.values()
    ) {

      await setupRoles(guild);
    }

  } catch (error) {

    console.log(
      "❌ خطأ في تجهيز الرتب:",
      error
    );
  }

  console.log("✅ البوت Online");
});

// ======================================================
//                  MEMBER JOIN
// ======================================================

client.on(
  "guildMemberAdd",
  async member => {

    try {

      // ==================================================
      // إعطاء Player
      // ==================================================

      const playerRole =
        getRoleByName(
          member.guild,
          PLAYER_ROLE_NAME
        );

      if (playerRole) {

        try {

          await member.roles.add(
            playerRole
          );

          console.log(
            `✅ تم إعطاء player لـ ${member.user.tag}`
          );

        } catch (error) {

          console.log(
            "❌ لم أستطع إعطاء player:",
            error.message
          );
        }
      }

      // ==================================================
      // WELCOME
      // ==================================================

      const welcomeChannel =
        member.guild.channels.cache.get(
          WELCOME_CHANNEL_ID
        );

      if (!welcomeChannel) {
        return;
      }

      const welcomeEmbed =
        new EmbedBuilder()
          .setDescription(
            `🌟 | مرحباً بك <@${member.id}>\n\n` +
            `🎊 سعداء بانضمامك إلى سيرفر 𝐂𝐎𝐏𝐄𝐑𝐂𝐑𝐀𝐅𝐓𝐄\n\n` +
            `🚀 استمتع بالفعاليات والتحديات\n` +
            `📖 لا تنسَ الاطلاع على القوانين\n\n` +
            `✨ نتمنى لك إقامة ممتعة بيننا`
          )
          .setColor(0x5865F2)
          .setThumbnail(
            member.user.displayAvatarURL({
              dynamic: true
            })
          );

      await welcomeChannel.send({
        embeds: [
          welcomeEmbed
        ]
      });

      console.log(
        `👋 عضو جديد: ${member.user.tag}`
      );

    } catch (error) {

      console.log(
        "❌ خطأ في guildMemberAdd:",
        error
      );
    }
  }
);

// ======================================================
//                    SLASH COMMANDS
// ======================================================

const commands = [

  // ==================================================
  // /ip
  // ==================================================

  new SlashCommandBuilder()
    .setName("ip")
    .setDescription("عرض IP السيرفر"),

  // ==================================================
  // /points
  // ==================================================

  new SlashCommandBuilder()
    .setName("points")
    .setDescription("عرض نقاطك"),

  // ==================================================
  // /rank
  // ==================================================

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("عرض رتبتك ونقاطك"),

  // ==================================================
  // /addpoints
  // ==================================================

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

  // ==================================================
  // /removepoints
  // ==================================================

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

  // ==================================================
  // /warn
  // ==================================================

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
    ),

  // ==================================================
  // /warnings
  // ==================================================

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("عرض تحذيرات عضو")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    ),

  // ==================================================
  // /kick
  // ==================================================

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
    ),

  // ==================================================
  // /mute
  // ==================================================

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
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("السبب")
    ),

  // ==================================================
  // /ban
  // ==================================================

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
    ),

  // ==================================================
  // /ticket-setup
  // ==================================================

  new SlashCommandBuilder()
    .setName("ticket-setup")
    .setDescription("إنشاء لوحة التذاكر")

].map(command =>
  command.toJSON()
);

// ======================================================
//                REGISTER COMMANDS
// ======================================================

async function registerCommands() {

  try {

    const rest =
      new REST({
        version: "10"
      }).setToken(TOKEN);

    console.log(
      "⏳ جاري تسجيل الأوامر..."
    );

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

      console.log(
        "✅ تم تسجيل الأوامر في السيرفر"
      );

    } else {

      await rest.put(
        Routes.applicationCommands(
          CLIENT_ID
        ),
        {
          body: commands
        }
      );

      console.log(
        "✅ تم تسجيل الأوامر Global"
      );
    }

  } catch (error) {

    console.log(
      "❌ خطأ في تسجيل الأوامر:",
      error
    );
  }
}

// ======================================================
//                    INTERACTIONS
// ======================================================

client.on(
  "interactionCreate",
  async interaction => {

    try {

      // ==================================================
      //                  SLASH COMMANDS
      // ==================================================

      if (interaction.isChatInputCommand()) {

        const command =
          interaction.commandName;

        const member =
          interaction.member;

        // ==================================================
        // /ip
        // ==================================================

        if (command === "ip") {

          const embed =
            new EmbedBuilder()
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

        // ==================================================
        // /points
        // ==================================================
        //
        // ممنوع Player / King
        // وممنوع Trial/Sr Helper استخدام الأوامر
        // حسب النظام المطلوب.
        //
        // نخليها فقط Mod+
        //

        if (command === "points") {

          if (!isModOrHigher(member)) {

            return interaction.reply({
              content:
                "❌ هذا الأمر متاح من رتبة **Mod** إلى **Owner** فقط.",
              ephemeral: true
            });
          }

          const points =
            getPoints(member.id);

          const rank =
            getStaffRank(member);

          return interaction.reply({
            content:
              `⭐ نقاطك: **${points}**\n` +
              `🏅 رتبتك: **${rank.name}**`
          });
        }

        // ==================================================
        // /rank
        // ==================================================

        if (command === "rank") {

          if (!isModOrHigher(member)) {

            return interaction.reply({
              content:
                "❌ هذا الأمر متاح من رتبة **Mod** إلى **Owner** فقط.",
              ephemeral: true
            });
          }

          const points =
            getPoints(member.id);

          const rankIndex =
            getStaffRankIndex(member);

          const rank =
            STAFF_RANKS[rankIndex];

          if (rankIndex === STAFF_RANKS.length - 1) {

            return interaction.reply({
              content:
                `🏆 رتبتك: **Owner**\n` +
                `⭐ نظام النقاط متوقف عند Owner.`
            });
          }

          const remaining =
            Math.max(
              0,
              rank.nextPoints - points
            );

          return interaction.reply({
            content:
              `🏅 رتبتك: **${rank.name}**\n` +
              `⭐ نقاطك: **${points}**\n` +
              `📈 تحتاج **${remaining}** نقطة للترقية إلى **${STAFF_RANKS[rankIndex + 1].name}**`
          });
        }

        // ==================================================
        // /addpoints
        // ==================================================

        if (command === "addpoints") {

          if (
            interaction.guild.ownerId !==
            interaction.user.id
          ) {

            return interaction.reply({
              content:
                "❌ هذا الأمر للـ Server Owner فقط.",
              ephemeral: true
            });
          }

          const target =
            interaction.options.getMember(
              "user"
            );

          const amount =
            interaction.options.getInteger(
              "amount"
            );

          if (!target) {

            return interaction.reply({
              content:
                "❌ العضو غير موجود.",
              ephemeral: true
            });
          }

          if (!isStaff(target)) {

            return interaction.reply({
              content:
                "❌ هذا العضو ليس Staff.",
              ephemeral: true
            });
          }

          if (isOwnerRank(target)) {

            return interaction.reply({
              content:
                "❌ رتبة Owner لا تستخدم نظام النقاط.",
              ephemeral: true
            });
          }

          addPoints(
            target.id,
            amount
          );

          await updateStaffRank(
            target
          );

          return interaction.reply({
            content:
              `✅ تم إضافة **${amount}** نقطة إلى ${target}.\n` +
              `⭐ النقاط الحالية: **${getPoints(target.id)}**`
          });
        }

        // ==================================================
        // /removepoints
        // ==================================================

        if (command === "removepoints") {

          if (
            interaction.guild.ownerId !==
            interaction.user.id
          ) {

            return interaction.reply({
              content:
                "❌ هذا الأمر للـ Server Owner فقط.",
              ephemeral: true
            });
          }

          const target =
            interaction.options.getMember(
              "user"
            );

          const amount =
            interaction.options.getInteger(
              "amount"
            );

          if (!target) {

            return interaction.reply({
              content:
                "❌ العضو غير موجود.",
              ephemeral: true
            });
          }

          if (!isStaff(target)) {

            return interaction.reply({
              content:
                "❌ هذا العضو ليس Staff.",
              ephemeral: true
            });
          }

          if (isOwnerRank(target)) {

            return interaction.reply({
              content:
                "❌ رتبة Owner لا تستخدم نظام النقاط.",
              ephemeral: true
            });
          }

          removePoints(
            target.id,
            amount
          );

          return interaction.reply({
            content:
              `✅ تم إزالة **${amount}** نقطة من ${target}.\n` +
              `⭐ النقاط الحالية: **${getPoints(target.id)}**`
          });
        }

        // ==================================================
        // /warn
        // ==================================================

        if (command === "warn") {

          if (!isModOrHigher(member)) {

            return interaction.reply({
              content:
                "❌ تحتاج رتبة **Mod** أو أعلى.",
              ephemeral: true
            });
          }

          const target =
            interaction.options.getMember(
              "user"
            );

          const reason =
            interaction.options.getString(
              "reason"
            ) || "بدون سبب";

          if (!target) {

            return interaction.reply({
              content:
                "❌ العضو غير موجود.",
              ephemeral: true
            });
          }

          if (
            target.id ===
            interaction.guild.ownerId
          ) {

            return interaction.reply({
              content:
                "❌ لا يمكن معاقبة Server Owner.",
              ephemeral: true
            });
          }

          const executorRank =
            getStaffRankIndex(member);

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

          const warns =
            getWarns(target.id) + 1;

          setWarns(
            target.id,
            warns
          );

          let actionText =
            "⚠️ تم تسجيل التحذير.";

          // Warn 2 = Timeout
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
                "⚠️ تم تسجيل التحذير لكن البوت لا يستطيع عمل Timeout.";
            }
          }

          // Warn 3 = Kick
          if (warns === 3) {

            if (target.kickable) {

              await target.kick(
                reason
              );

              actionText =
                "👢 تم طرد العضو.";

            } else {

              actionText =
                "⚠️ تم تسجيل التحذير لكن البوت لا يستطيع طرد العضو.";
            }
          }

          // Warn 4 = Ban
          if (warns >= 4) {

            if (target.bannable) {

              await target.ban({
                reason
              });

              db.banUntil[target.id] =
                Date.now() +
                24 * 60 * 60 * 1000;

              setWarns(
                target.id,
                0
              );

              actionText =
                "🔨 تم حظر العضو لمدة 24 ساعة.";

            } else {

              actionText =
                "⚠️ تم تسجيل التحذير لكن البوت لا يستطيع حظر العضو.";
            }
          }

          const embed =
            new EmbedBuilder()
              .setTitle("⚠️ Warning")
              .setDescription(
                `👤 العضو: ${target}\n` +
                `📝 السبب: **${reason}**\n` +
                `⚠️ التحذيرات: **${getWarns(target.id)}**\n\n` +
                `${actionText}`
              )
              .setColor(0xF1C40F);

          return interaction.reply({
            embeds: [embed]
          });
        }

        // ==================================================
        // /warnings
        // ==================================================

        if (command === "warnings") {

          if (!isModOrHigher(member)) {

            return interaction.reply({
              content:
                "❌ تحتاج رتبة **Mod** أو أعلى.",
              ephemeral: true
            });
          }

          const target =
            interaction.options.getMember(
              "user"
            );

          if (!target) {

            return interaction.reply({
              content:
                "❌ العضو غير موجود.",
              ephemeral: true
            });
          }

          return interaction.reply({
            content:
              `⚠️ تحذيرات ${target}: **${getWarns(target.id)}**`
          });
        }

        // ==================================================
        // /kick
        // ==================================================

        if (command === "kick") {

          if (!isModOrHigher(member)) {

            return interaction.reply({
              content:
                "❌ تحتاج رتبة **Mod** أو أعلى.",
              ephemeral: true
            });
          }

          const target =
            interaction.options.getMember(
              "user"
            );

          const reason =
            interaction.options.getString(
              "reason"
            ) || "بدون سبب";

          if (!target) {

            return interaction.reply({
              content:
                "❌ العضو غير موجود.",
                ephemeral: true
            });
          }

          if (
            target.id ===
            interaction.guild.ownerId
          ) {

            return interaction.reply({
              content:
                "❌ لا يمكن طرد Server Owner.",
              ephemeral: true
            });
          }

          const executorRank =
            getStaffRankIndex(member);

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
                "❌ البوت لا يستطيع طرد هذا العضو.",
              ephemeral: true
            });
          }

          await target.kick(
            reason
          );

          return interaction.reply({
            content:
              `👢 تم طرد ${target.user.tag}\n` +
              `📝 السبب: ${reason}`
          });
        }

        // ==================================================
        // /mute
        // ==================================================

        if (command === "mute") {

          if (!isModOrHigher(member)) {

            return interaction.reply({
              content:
                "❌ تحتاج رتبة **Mod** أو أعلى.",
              ephemeral: true
            });
          }

          const target =
            interaction.options.getMember(
              "user"
            );

          const minutes =
            interaction.options.getInteger(
              "minutes"
            ) || 10;

          const reason =
            interaction.options.getString(
              "reason"
            ) || "بدون سبب";

          if (!target) {

            return interaction.reply({
              content:
                "❌ العضو غير موجود.",
              ephemeral: true
            });
          }

          if (
            target.id ===
            interaction.guild.ownerId
          ) {

            return interaction.reply({
              content:
                "❌ لا يمكن عمل Timeout للـ Owner.",
              ephemeral: true
            });
          }

          const executorRank =
            getStaffRankIndex(member);

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

        // ==================================================
        // /ban
        // ==================================================

        if (command === "ban") {

          if (!isModOrHigher(member)) {

            return interaction.reply({
              content:
                "❌ تحتاج رتبة **Mod** أو أعلى.",
              ephemeral: true
            });
          }

          const target =
            interaction.options.getMember(
              "user"
            );

          const reason =
            interaction.options.getString(
              "reason"
            ) || "بدون سبب";

          if (!target) {

            return interaction.reply({
              content:
                "❌ العضو غير موجود.",
              ephemeral: true
            });
          }

          if (
            target.id ===
            interaction.guild.ownerId
          ) {

            return interaction.reply({
              content:
                "❌ لا يمكن حظر Server Owner.",
              ephemeral: true
            });
          }

          const executorRank =
            getStaffRankIndex(member);

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

        // ==================================================
        // /ticket-setup
        // ==================================================

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

          const embed =
            new EmbedBuilder()
              .setTitle("🎫 الدعم الفني")
              .setDescription(
                "اضغط على الزر بالأسفل لفتح تذكرة.\n\n" +
                "📌 يمكنك فتح تذكرة واحدة فقط في نفس الوقت.\n" +
                "🛡️ فريق Staff سيقوم باستلام التذكرة ومساعدتك."
              )
              .setColor(0x5865F2);

          const button =
            new ButtonBuilder()
              .setCustomId(
                "open_ticket"
              )
              .setLabel("فتح تذكرة")
              .setEmoji("🎫")
              .setStyle(
                ButtonStyle.Primary
              );

          const row =
            new ActionRowBuilder()
              .addComponents(
                button
              );

          await interaction.channel.send({
            embeds: [embed],
            components: [row]
          });

          return interaction.reply({
            content:
              "✅ تم إنشاء لوحة التذاكر.",
            ephemeral: true
          });
        }
      }

      // ==================================================
      //                    OPEN TICKET
      // ==================================================

      if (
        interaction.isButton() &&
        interaction.customId ===
          "open_ticket"
      ) {

        const guild =
          interaction.guild;

        const user =
          interaction.user;

        // ==================================================
        // Check existing ticket
        // ==================================================

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

        // ==================================================
        // Staff roles
        // ==================================================

        const staffRoles = [];

        for (
          const rank
          of STAFF_RANKS
        ) {

          const role =
            getRoleByName(
              guild,
              rank.name
            );

          if (role) {
            staffRoles.push(role);
          }
        }

        // ==================================================
        // Trial role
        // ==================================================

        const trialRole =
          getRoleByName(
            guild,
            "Trial"
          );

        // ==================================================
        // Ticket channel
        // ==================================================

        let ticketName =
          `ticket-${user.username}`
            .toLowerCase()
            .replace(
              /[^a-z0-9-_]/g,
              ""
            )
            .slice(0, 70);

        if (!ticketName) {
          ticketName =
            `ticket-${user.id}`;
        }

        const channel =
          await guild.channels.create({

            name: ticketName,

            type:
              ChannelType.GuildText,

            permissionOverwrites: [

              // ------------------------------------------
              // Everyone
              // ------------------------------------------

              {
                id:
                  guild.roles.everyone.id,

                deny: [
                  PermissionsBitField.Flags.ViewChannel
                ]
              },

              // ------------------------------------------
              // Ticket owner
              // ------------------------------------------

              {
                id: user.id,

                allow: [
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.SendMessages,
                  PermissionsBitField.Flags.ReadMessageHistory
                ]
              },

              // ------------------------------------------
              // Staff
              // ------------------------------------------

              ...staffRoles.map(
                role => ({
                  id: role.id,

                  allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory
                  ]
                })
              )
            ]
          });

        // ==================================================
        // Save ticket
        // ==================================================

        db.tickets[user.id] = {

          channelId:
            channel.id,

          createdAt:
            Date.now(),

          claimedBy:
            null
        };

        saveDB();

        // ==================================================
        // CLOSE BUTTON
        // ==================================================

        const closeButton =
          new ButtonBuilder()
            .setCustomId(
              "close_ticket"
            )
            .setLabel(
              "إغلاق التذكرة"
            )
            .setEmoji("🔒")
            .setStyle(
              ButtonStyle.Danger
            );

        // ==================================================
        // CLAIM BUTTON
        // ==================================================

        const claimButton =
          new ButtonBuilder()
            .setCustomId(
              "claim_ticket"
            )
            .setLabel(
              "استلام التذكرة"
            )
            .setEmoji("🙋")
            .setStyle(
              ButtonStyle.Success
            );

        const row =
          new ActionRowBuilder()
            .addComponents(
              claimButton,
              closeButton
            );

        // ==================================================
        // Ticket Embed
        // ==================================================

        const ticketEmbed =
          new EmbedBuilder()
            .setTitle(
              "🎫 تذكرة دعم"
            )
            .setDescription(
              `أهلاً ${user} 👋\n\n` +
              `📌 اكتب مشكلتك هنا وسيقوم فريق الإدارة بمساعدتك.\n\n` +
              `🙋 أول Staff يستلم التذكرة يحصل على **+10 نقاط**.\n` +
              `❌ محاولة استلام تذكرة مستلمة تخصم **20 نقطة**.\n\n` +
              `🔒 إغلاق التذكرة متاح للـ Server Owner فقط.`
            )
            .addFields(
              {
                name:
                  "👤 صاحب التذكرة",

                value:
                  `${user}`,

                inline: true
              },
              {
                name:
                  "🙋 المستلم",

                value:
                  "لم يتم الاستلام بعد",

                inline: true
              }
            )
            .setColor(
              0x5865F2
            );

        // ==================================================
        // FIRST MESSAGE
        // ==================================================
        //
        // منشن صاحب التذكرة
        // + منشن Trial
        //

        await channel.send({

          content:
            `${user} ${trialRole ? trialRole : ""}`,

          embeds: [
            ticketEmbed
          ],

          components: [
            row
          ]
        });

        return interaction.reply({
          content:
            `✅ تم فتح تذكرتك: ${channel}`,
          ephemeral: true
        });
      }

      // ==================================================
      //                    CLAIM TICKET
      // ==================================================

      if (
        interaction.isButton() &&
        interaction.customId ===
          "claim_ticket"
      ) {

        const guild =
          interaction.guild;

        const member =
          interaction.member;

        // ==================================================
        // هل هو Staff؟
        // ==================================================

        if (!isStaff(member)) {

          return interaction.reply({
            content:
              "❌ فقط Staff يستطيع استلام التذاكر.",
            ephemeral: true
          });
        }

        // ==================================================
        // البحث عن التذكرة
        // ==================================================

        const ticketEntry =
          Object.entries(
            db.tickets
          ).find(
            ([userId, ticket]) =>
              ticket.channelId ===
              interaction.channel.id
          );

        if (!ticketEntry) {

          return interaction.reply({
            content:
              "❌ هذه القناة ليست تذكرة مسجلة.",
            ephemeral: true
          });
        }

        const [
          ownerId,
          ticket
        ] = ticketEntry;

        // ==================================================
        // صاحب التذكرة ممنوع يستلم
        // ==================================================

        if (
          ownerId ===
          interaction.user.id
        ) {

          return interaction.reply({
            content:
              "❌ لا يمكنك استلام التذكرة التي فتحتها بنفسك.",
            ephemeral: true
          });
        }

        // ==================================================
        // التذكرة مستلمة بالفعل
        // ==================================================

        if (ticket.claimedBy) {

          // خصم 20 نقطة
          const newPoints =
            removePoints(
              member.id,
              20
            );

          return interaction.reply({
            content:
              `❌ هذه التذكرة مستلمة بالفعل بواسطة <@${ticket.claimedBy}>.\n\n` +
              `💸 تم خصم **20 نقطة** منك.\n` +
              `⭐ نقاطك الآن: **${newPoints}**`,
            ephemeral: true
          });
        }

        // ==================================================
        // استلام التذكرة
        // ==================================================

        ticket.claimedBy =
          interaction.user.id;

        db.tickets[ownerId] =
          ticket;

        // +10 نقاط
        const newPoints =
          addPoints(
            member.id,
            10
          );

        // حفظ
        saveDB();

        // ==================================================
        // تحديث الرسالة
        // ==================================================

        const claimedEmbed =
          new EmbedBuilder()
            .setTitle(
              "🎫 تذكرة دعم"
            )
            .setDescription(
              `👤 صاحب التذكرة: <@${ownerId}>\n\n` +
              `🙋 تم استلام التذكرة بواسطة ${member}.\n\n` +
              `⭐ حصل Staff على **+10 نقاط** مقابل استلام التذكرة.`
            )
            .addFields(
              {
                name:
                  "👤 صاحب التذكرة",

                value:
                  `<@${ownerId}>`,

                inline: true
              },
              {
                name:
                  "🙋 المستلم",

                value:
                  `${member}`,

                inline: true
              }
            )
            .setColor(
              0x57F287
            );

        const disabledClaimButton =
          new ButtonBuilder()
            .setCustomId(
              "claim_ticket"
            )
            .setLabel(
              `تم الاستلام بواسطة ${interaction.user.username}`
            )
            .setEmoji("✅")
            .setStyle(
              ButtonStyle.Success
            )
            .setDisabled(true);

        const closeButton =
          new ButtonBuilder()
            .setCustomId(
              "close_ticket"
            )
            .setLabel(
              "إغلاق التذكرة"
            )
            .setEmoji("🔒")
            .setStyle(
              ButtonStyle.Danger
            );

        const row =
          new ActionRowBuilder()
            .addComponents(
              disabledClaimButton,
              closeButton
            );

        try {

          await interaction.message.edit({
            embeds: [
              claimedEmbed
            ],
            components: [
              row
            ]
          });

        } catch (error) {

          console.log(
            "❌ لم أستطع تحديث التذكرة:",
            error.message
          );
        }

        // ==================================================
        // تحديث صلاحيات صاحب التذكرة
        // ==================================================

        try {

          await interaction.channel.permissionOverwrites.edit(
            interaction.user.id,
            {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true
            }
          );

        } catch {}

        // ==================================================
        // الترقية إذا وصل للحد
        // ==================================================

        await updateStaffRank(
          member
        );

        return interaction.reply({
          content:
            `✅ تم استلام التذكرة بنجاح.\n` +
            `⭐ حصلت على **+10 نقاط**.\n` +
            `⭐ نقاطك الحالية: **${getPoints(member.id)}**`,
          ephemeral: true
        });
      }

      // ==================================================
      //                    CLOSE TICKET
      // ==================================================

      if (
        interaction.isButton() &&
        interaction.customId ===
          "close_ticket"
      ) {

        // ==================================================
        // Owner فقط
        // ==================================================

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

        // ==================================================
        // حذف من DB
        // ==================================================

        const ticketEntry =
          Object.entries(
            db.tickets
          ).find(
            ([userId, ticket]) =>
              ticket.channelId ===
              interaction.channel.id
          );

        if (ticketEntry) {

          const [
            userId
          ] = ticketEntry;

          delete db.tickets[userId];

          saveDB();
        }

        await interaction.reply({
          content:
            "🔒 سيتم إغلاق التذكرة خلال 3 ثواني..."
        });

        setTimeout(
          async () => {

            try {

              await interaction.channel.delete();

            } catch (error) {

              console.log(
                "❌ لم أستطع حذف التذكرة:",
                error.message
              );
            }

          },
          3000
        );
      }

    } catch (error) {

      console.log(
        "❌ Interaction Error:",
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {

        try {

          await interaction.reply({
            content:
              "❌ حدث خطأ أثناء تنفيذ الأمر.",
            ephemeral: true
          });

        } catch {}
      }
    }
  }
);

// ======================================================
//                    MESSAGE SYSTEM
// ======================================================

client.on(
  "messageCreate",
  async message => {

    try {

      if (message.author.bot) {
        return;
      }

      if (!message.guild) {
        return;
      }

      // ==================================================
      // IP AUTO RESPONSE
      // ==================================================

      if (
        message.content
          .trim()
          .toLowerCase() ===
        "ip"
      ) {

        const embed =
          new EmbedBuilder()
            .setTitle(
              "🌐 CoperCraft Server"
            )
            .setDescription(
              `**IP:**\n\`${SERVER_IP}\`\n\n` +
              `**Port:**\n\`${SERVER_PORT}\``
            )
            .setColor(
              0x5865F2
            );

        await message.reply({
          embeds: [
            embed
          ]
        });
      }

      // ==================================================
      // SPAM PROTECTION
      // ==================================================

      if (
        message.guild.ownerId !==
        message.author.id
      ) {

        const now =
          Date.now();

        const lastMessage =
          Number(
            db.spam[
              message.author.id
            ] || 0
          );

        const difference =
          now - lastMessage;

        if (
          difference < 10000
        ) {

          try {
            await message.delete();
          } catch {}

          return;
        }

        db.spam[
          message.author.id
        ] = now;

        saveDB();
      }

      // ==================================================
      // STAFF POINTS
      // ==================================================

      const member =
        message.member;

      if (
        member &&
        isStaff(member)
      ) {

        const rankIndex =
          getStaffRankIndex(
            member
          );

        // Owner لا يحصل على نقاط
        if (
          rankIndex ===
          STAFF_RANKS.length - 1
        ) {
          return;
        }

        const now =
          Date.now();

        const lastPoint =
          Number(
            db.pointCooldown[
              member.id
            ] || 0
          );

        // نقطة كل 60 ثانية
        if (
          now - lastPoint >=
          60 * 1000
        ) {

          addPoints(
            member.id,
            1
          );

          db.pointCooldown[
            member.id
          ] = now;

          saveDB();

          await updateStaffRank(
            member
          );
        }
      }

    } catch (error) {

      console.log(
        "❌ Message Error:",
        error
      );
    }
  }
);

// ======================================================
//                     AUTO UNBAN
// ======================================================

async function checkExpiredBans() {

  const now =
    Date.now();

  for (
    const [
      userId,
      banTime
    ]
    of Object.entries(
      db.banUntil
    )
  ) {

    if (
      now >=
      Number(banTime)
    ) {

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

      delete db.banUntil[
        userId
      ];

      setWarns(
        userId,
        0
      );
    }
  }

  saveDB();
}

// ======================================================
//                      ERRORS
// ======================================================

client.on(
  "error",
  error => {

    console.log(
      "❌ Discord Client Error:",
      error
    );
  }
);

process.on(
  "unhandledRejection",
  error => {

    console.log(
      "❌ Unhandled Rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {

    console.log(
      "❌ Uncaught Exception:",
      error
    );
  }
);

// ======================================================
//                       START
// ======================================================

async function startBot() {

  if (!TOKEN) {

    console.log(
      "❌ TOKEN غير موجود في Railway Variables"
    );

    return;
  }

  if (!CLIENT_ID) {

    console.log(
      "❌ CLIENT_ID غير موجود في Railway Variables"
    );

    return;
  }

  await registerCommands();

  await client.login(
    TOKEN
  );
}

startBot();

// ======================================================
//                CHECK EXPIRED BANS
// ======================================================

setInterval(
  () => {

    checkExpiredBans();

  },
  60 * 1000
);
