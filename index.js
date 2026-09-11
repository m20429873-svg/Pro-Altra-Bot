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
const path = require("path");

// ======================================================
// CONFIG
// ======================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || "";

const SERVER_IP = "Coper-_-crfte.aternos.me:31246";
const SERVER_PORT = "31246";

// الرتب بالترتيب
const STAFF_ROLES = [
  { name: "Trial", threshold: 0 },
  { name: "Helper", threshold: 100 },
  { name: "Sr Helper", threshold: 200 },
  { name: "Mod", threshold: 300 },
  { name: "Sr Mod", threshold: 400 },
  { name: "Jr Admin", threshold: 500 },
  { name: "Admin", threshold: 600 },
  { name: "Co Owner", threshold: 700 },
  { name: "Hp Owner", threshold: 800 },
  { name: "Owner", threshold: 900 }
];

// Player لا يدخل هنا نهائيا
const PLAYER_ROLE = "player";

// عدد النقاط التي يحصل عليها الإداري من النشاط
const POINTS_PER_MESSAGE = 1;

// منع احتساب كل رسالة كنقطة
const POINT_COOLDOWN = 60 * 1000;

// السبام: 10 ثواني
const SPAM_COOLDOWN = 10 * 1000;

// مدة البان في Warn 4
const BAN_DURATION = 24 * 60 * 60 * 1000;

// ======================================================
// DATABASE FILE
// ======================================================

const DATA_FILE = path.join(__dirname, "database.json");

let db = {
  points: {},
  warns: {},
  tickets: {},
  spam: {}
};

function loadDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (err) {
    console.log("Database load error:", err);
  }
}

function saveDB() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    console.log("Database save error:", err);
  }
}

loadDB();

// ======================================================
// CLIENT
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ======================================================
// HELPERS
// ======================================================

function isServerOwner(member) {
  return member.guild.ownerId === member.id;
}

function getStaffLevel(member) {
  for (let i = STAFF_ROLES.length - 1; i >= 0; i--) {
    const role = member.roles.cache.find(
      r => r.name.toLowerCase() === STAFF_ROLES[i].name.toLowerCase()
    );

    if (role) {
      return i;
    }
  }

  return -1;
}

function getStaffRole(member) {
  const level = getStaffLevel(member);
  if (level === -1) return null;

  return STAFF_ROLES[level];
}

function isStaff(member) {
  return getStaffLevel(member) >= 0;
}

function canModerate(member) {
  const level = getStaffLevel(member);

  // Mod إلى Owner
  return level >= 3;
}

function canManagePoints(member) {
  const level = getStaffLevel(member);

  // Owner فقط
  return level === STAFF_ROLES.length - 1;
}

function getPoints(userId) {
  return db.points[userId] || 0;
}

function setPoints(userId, amount) {
  db.points[userId] = Math.max(0, amount);
  saveDB();
}

function addPoints(userId, amount) {
  setPoints(userId, getPoints(userId) + amount);
}

function getWarns(userId) {
  return db.warns[userId] || 0;
}

function setWarns(userId, amount) {
  db.warns[userId] = amount;
  saveDB();
}

function findRole(guild, roleName) {
  return guild.roles.cache.find(
    r => r.name.toLowerCase() === roleName.toLowerCase()
  );
}

function findTicketOwner(channelId) {
  return db.tickets[channelId]?.ownerId || null;
}

// ======================================================
// AUTO PROMOTION
// ======================================================

async function checkPromotion(member) {
  if (!member || member.user.bot) return;

  const currentLevel = getStaffLevel(member);

  // Player أو أي شخص ليس Trial
  if (currentLevel === -1) return;

  // Owner لا يترقى
  if (currentLevel >= STAFF_ROLES.length - 1) return;

  const points = getPoints(member.id);

  // نبحث عن أعلى رتبة يستحقها
  let targetLevel = currentLevel;

  for (let i = currentLevel + 1; i < STAFF_ROLES.length; i++) {
    if (points >= STAFF_ROLES[i].threshold) {
      targetLevel = i;
    } else {
      break;
    }
  }

  if (targetLevel <= currentLevel) return;

  const oldRole = findRole(member.guild, STAFF_ROLES[currentLevel].name);
  const newRole = findRole(member.guild, STAFF_ROLES[targetLevel].name);

  if (!newRole) {
    console.log(
      `Role not found: ${STAFF_ROLES[targetLevel].name}`
    );
    return;
  }

  try {
    if (oldRole) {
      await member.roles.remove(oldRole);
    }

    await member.roles.add(newRole);

    // النقاط تصفر بعد الترقية
    setPoints(member.id, 0);

    const nextName =
      STAFF_ROLES[targetLevel + 1]?.name || "أعلى رتبة";

    const embed = new EmbedBuilder()
      .setTitle("🎉 ترقية إدارية")
      .setDescription(
        `مبروك <@${member.id}>\n\n` +
        `تمت ترقيتك إلى **${STAFF_ROLES[targetLevel].name}** 🎉\n\n` +
        `النقاط الحالية: **0**\n` +
        `الرتبة التالية: **${nextName}**`
      )
      .setColor("Green")
      .setTimestamp();

    const channel = member.guild.systemChannel;

    if (channel) {
      await channel.send({ embeds: [embed] }).catch(() => {});
    }

  } catch (err) {
    console.log("Promotion error:", err);
  }
}

// ======================================================
// WARN SYSTEM
// ======================================================

async function applyWarn(member, moderator, reason) {
  const warns = getWarns(member.id) + 1;

  setWarns(member.id, warns);

  let action = "تحذير";

  try {
    if (warns === 1) {
      action = "⚠️ تحذير أول";
    }

    else if (warns === 2) {
      action = "🔇 Mute";

      if (member.moderatable) {
        await member.timeout(
          10 * 60 * 1000,
          reason || "Warn 2"
        );
      }
    }

    else if (warns === 3) {
      action = "👢 Kick";

      if (member.kickable) {
        await member.kick(
          reason || "Warn 3"
        );
      }
    }

    else if (warns >= 4) {
      action = "🔨 Ban لمدة يوم";

      if (member.bannable) {
        await member.ban({
          deleteMessageSeconds: 86400,
          reason: reason || "Warn 4"
        });

        setTimeout(async () => {
          try {
            await member.guild.bans.remove(
              member.id,
              "انتهاء مدة Ban - Warn 4"
            );

            // بعد انتهاء البان نرجع التحذيرات للصفر
            setWarns(member.id, 0);

          } catch (err) {
            console.log("Unban error:", err);
          }
        }, BAN_DURATION);
      }
    }

  } catch (err) {
    console.log("Warn action error:", err);
  }

  return {
    warns,
    action
  };
}

// ======================================================
// SLASH COMMANDS
// ======================================================

const commands = [

  new SlashCommandBuilder()
    .setName("ip")
    .setDescription("عرض IP السيرفر"),

  new SlashCommandBuilder()
    .setName("points")
    .setDescription("عرض نقاطك"),

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
        .setRequired(true)
        .setMinValue(1)
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
        .setRequired(true)
        .setMinValue(1)
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
        .setRequired(false)
    ),

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
    .setDescription("عمل Mute لعضو")
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
        .setRequired(false)
        .setMinValue(1)
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
    ),

  new SlashCommandBuilder()
    .setName("ticket-setup")
    .setDescription("إنشاء لوحة التذاكر"),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("عرض رتبتك ونقاطك")

].map(command => command.toJSON());

// ======================================================
// REGISTER COMMANDS
// ======================================================

async function registerCommands() {
  try {
    const rest = new REST({ version: "10" })
      .setToken(TOKEN);

    if (GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(
          CLIENT_ID,
          GUILD_ID
        ),
        { body: commands }
      );

      console.log("✅ Guild commands registered");
    } else {
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
      );

      console.log("✅ Global commands registered");
    }

  } catch (err) {
    console.log("Command registration error:", err);
  }
}

// ======================================================
// READY
// ======================================================

client.once("ready", async () => {

  console.log("=================================");
  console.log(`🤖 Logged in as ${client.user.tag}`);
  console.log("=================================");

  await registerCommands();
});

// ======================================================
// MEMBER JOIN
// ======================================================

client.on("guildMemberAdd", async member => {

  if (member.user.bot) return;

  try {

    const playerRole = findRole(
      member.guild,
      PLAYER_ROLE
    );

    if (playerRole) {
      await member.roles.add(playerRole);
    }

    const embed = new EmbedBuilder()
      .setTitle("🌟 WELCOME")
      .setDescription(
        `مرحباً بك <@${member.id}> 🎉\n\n` +
        `سعداء بانضمامك إلى السيرفر 💖\n\n` +
        `🚀 استمتع بالفعاليات والتحديات\n` +
        `📖 لا تنس الاطلاع على القوانين\n\n` +
        `✨ نتمنى لك إقامة ممتعة بيننا`
      )
      .setColor("Purple")
      .setThumbnail(member.user.displayAvatarURL())
      .setImage(
        "https://cdn.discordapp.com/embed/avatars/0.png"
      )
      .setFooter({
        text: `Member #${member.guild.memberCount}`
      })
      .setTimestamp();

    const channel =
      member.guild.systemChannel ||
      member.guild.channels.cache.find(
        c =>
          c.type === ChannelType.GuildText &&
          c.name.toLowerCase().includes("welcome")
      );

    if (channel) {
      await channel.send({
        content: `<@${member.id}>`,
        embeds: [embed]
      });
    }

  } catch (err) {
    console.log("Welcome error:", err);
  }
});

// ======================================================
// MESSAGE SYSTEM
// ======================================================

client.on("messageCreate", async message => {

  if (!message.guild) return;
  if (message.author.bot) return;

  // ==============================================
  // IP بدون /
  // ==============================================

  if (
    message.content.trim().toLowerCase() === "ip"
  ) {

    const embed = new EmbedBuilder()
      .setTitle("🎮 JAFA")
      .setDescription(
        `**JAFA:** ${SERVER_IP}\n` +
        `**Port:** ${SERVER_PORT}`
      )
      .setColor("Blue");

    return message.reply({
      embeds: [embed]
    });
  }

  // ==============================================
  // SPAM PROTECTION
  // ==============================================

  const member = message.member;

  // صاحب السيرفر مستثنى
  if (!isServerOwner(member)) {

    const now = Date.now();
    const last = db.spam[member.id] || 0;

    if (now - last < SPAM_COOLDOWN) {

      try {
        await message.delete();
      } catch {}

      return;
    }

    db.spam[member.id] = now;
    saveDB();
  }

  // ==============================================
  // POINTS
  // Trial -> Owner فقط
  // Player لا يحصل نقاط
  // ==============================================

  if (isStaff(member)) {

    const currentLevel = getStaffLevel(member);

    // Owner لا يحتاج نقاط
    if (
      currentLevel >= 0 &&
      currentLevel < STAFF_ROLES.length - 1
    ) {

      const now = Date.now();

      const key = `point_${member.id}`;

      if (!db.spam[key]) {
        db.spam[key] = 0;
      }

      if (
        now - db.spam[key] >= POINT_COOLDOWN
      ) {

        db.spam[key] = now;

        addPoints(
          member.id,
          POINTS_PER_MESSAGE
        );

        await checkPromotion(member);
      }
    }
  }
});

// ======================================================
// INTERACTIONS
// ======================================================

client.on("interactionCreate", async interaction => {

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

      // الشخص ممنوع يفتح أكثر من تكت
      const existingTicket =
        Object.entries(db.tickets).find(
          ([channelId, data]) =>
            data.ownerId === user.id &&
            data.guildId === guild.id
        );

      if (existingTicket) {

        const channel =
          guild.channels.cache.get(
            existingTicket[0]
          );

        if (channel) {
          return interaction.reply({
            content:
              `❌ عندك تذكرة مفتوحة بالفعل: ${channel}`,
            ephemeral: true
          });
        }

        delete db.tickets[existingTicket[0]];
        saveDB();
      }

      try {

        // إنشاء التذكرة
        const channel =
          await guild.channels.create({
            name: `ticket-${user.username}`
              .toLowerCase()
              .replace(/[^a-z0-9-_]/g, "")
              .slice(0, 20),

            type: ChannelType.GuildText,

            permissionOverwrites: [
              {
                id: guild.roles.everyone.id,
                deny: [
                  PermissionsBitField.Flags.ViewChannel
                ]
              },
              {
                id: user.id,
                allow: [
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.SendMessages,
                  PermissionsBitField.Flags.ReadMessageHistory
                ]
              }
            ]
          });

        db.tickets[channel.id] = {
          guildId: guild.id,
          ownerId: user.id,
          createdAt: Date.now()
        };

        saveDB();

        const embed = new EmbedBuilder()
          .setTitle("🎫 Ticket")
          .setDescription(
            `مرحباً <@${user.id}>\n\n` +
            `تم فتح التذكرة الخاصة بك.\n` +
            `اكتب مشكلتك بالتفصيل وسيتم الرد عليك من الإدارة.\n\n` +
            `🔒 عند انتهاء المشكلة يمكن للإدارة إغلاق التذكرة.`
          )
          .setColor("Blue")
          .setTimestamp();

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId("close_ticket")
              .setLabel("Close Ticket")
              .setEmoji("🔒")
              .setStyle(ButtonStyle.Danger)
          );

        await channel.send({
          content: `<@${user.id}>`,
          embeds: [embed],
          components: [row]
        });

        await interaction.reply({
          content: `✅ تم فتح تذكرتك: ${channel}`,
          ephemeral: true
        });

      } catch (err) {

        console.log("Ticket create error:", err);

        return interaction.reply({
          content:
            "❌ لم أستطع إنشاء التذكرة. تأكد من صلاحيات البوت.",
          ephemeral: true
        });
      }
    }

    // ================================================
    // CLOSE TICKET
    // ================================================

    if (interaction.customId === "close_ticket") {

      const member = interaction.member;
      const channel = interaction.channel;

      const ticket = db.tickets[channel.id];

      if (!ticket) {
        return interaction.reply({
          content: "❌ هذه ليست تذكرة مسجلة.",
          ephemeral: true
        });
      }

      // صاحب التذكرة لا يستطيع إغلاقها
      if (!canModerate(member)) {
        return interaction.reply({
          content:
            "❌ لا يمكنك إغلاق التذكرة. الإغلاق متاح من رتبة Mod إلى Owner.",
          ephemeral: true
        });
      }

      await interaction.reply(
        "🔒 سيتم إغلاق التذكرة خلال 3 ثواني..."
      );

      setTimeout(async () => {

        delete db.tickets[channel.id];
        saveDB();

        try {
          await channel.delete();
        } catch {}

      }, 3000);
    }

    return;
  }

  // ==================================================
  // SLASH COMMANDS
  // ==================================================

  if (!interaction.isChatInputCommand()) return;

  const command = interaction.commandName;
  const member = interaction.member;

  // ==================================================
  // IP
  // ==================================================

  if (command === "ip") {

    const embed = new EmbedBuilder()
      .setTitle("🎮 JAFA")
      .setDescription(
        `**JAFA:** ${SERVER_IP}\n` +
        `**Port:** ${SERVER_PORT}`
      )
      .setColor("Blue");

    return interaction.reply({
      embeds: [embed]
    });
  }

  // ==================================================
  // POINTS
  // ==================================================

  if (command === "points") {

    const level = getStaffLevel(member);

    if (level === -1) {

      return interaction.reply({
        content:
          "❌ نظام النقاط يبدأ من رتبة Trial فقط.",
        ephemeral: true
      });
    }

    if (
      level === STAFF_ROLES.length - 1
    ) {

      return interaction.reply({
        content:
          "👑 أنت Owner، لا يوجد لك نظام نقاط أو ترقية.",
        ephemeral: true
      });
    }

    const points = getPoints(member.id);
    const next = STAFF_ROLES[level + 1];

    const needed =
      Math.max(0, next.threshold - points);

    const embed = new EmbedBuilder()
      .setTitle("⭐ نقاط الإدارة")
      .setDescription(
        `الرتبة: **${STAFF_ROLES[level].name}**\n` +
        `النقاط: **${points}**\n\n` +
        `الترقية القادمة: **${next.name}**\n` +
        `تحتاج: **${needed}** نقطة`
      )
      .setColor("Gold");

    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }

  // ==================================================
  // RANK
  // ==================================================

  if (command === "rank") {

    const level = getStaffLevel(member);

    if (level === -1) {

      const playerRole =
        findRole(member.guild, PLAYER_ROLE);

      return interaction.reply({
        content:
          `🎮 رتبتك: **${playerRole ? playerRole.name : "Player"}**\n` +
          `⭐ النقاط: لا يوجد`,
        ephemeral: true
      });
    }

    const points =
      level === STAFF_ROLES.length - 1
        ? 0
        : getPoints(member.id);

    return interaction.reply({
      content:
        `🏷️ الرتبة: **${STAFF_ROLES[level].name}**\n` +
        `⭐ النقاط: **${points}**`,
      ephemeral: true
    });
  }

  // ==================================================
  // ADD POINTS
  // ==================================================

  if (command === "addpoints") {

    if (!canManagePoints(member)) {

      return interaction.reply({
        content:
          "❌ هذا الأمر للـ Owner فقط.",
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

    const targetLevel =
      getStaffLevel(target);

    if (
      targetLevel === -1 ||
      targetLevel >= STAFF_ROLES.length - 1
    ) {

      return interaction.reply({
        content:
          "❌ يمكنك تعديل نقاط الرتب من Trial إلى Hp Owner فقط.",
        ephemeral: true
      });
    }

    addPoints(target.id, amount);

    await checkPromotion(target);

    return interaction.reply(
      `✅ تمت إضافة **${amount}** نقطة إلى <@${target.id}>.`
    );
  }

  // ==================================================
  // REMOVE POINTS
  // ==================================================

  if (command === "removepoints") {

    if (!canManagePoints(member)) {

      return interaction.reply({
        content:
          "❌ هذا الأمر للـ Owner فقط.",
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

    // Owner لا يستطيع تعديل نفسه
    if (target.id === member.id) {

      return interaction.reply({
        content:
          "❌ لا يمكنك إنقاص نقاط نفسك.",
        ephemeral: true
      });
    }

    const targetLevel =
      getStaffLevel(target);

    if (
      targetLevel === -1 ||
      targetLevel >= STAFF_ROLES.length - 1
    ) {

      return interaction.reply({
        content:
          "❌ يمكنك تعديل نقاط الرتب من Trial إلى Hp Owner فقط.",
        ephemeral: true
      });
    }

    const oldPoints =
      getPoints(target.id);

    const newPoints =
      Math.max(0, oldPoints - amount);

    setPoints(target.id, newPoints);

    return interaction.reply(
      `✅ تم إنقاص **${amount}** نقطة من <@${target.id}>.\n` +
      `⭐ نقاطه الآن: **${newPoints}**`
    );
  }

  // ==================================================
  // WARN
  // ==================================================

  if (command === "warn") {

    if (!canModerate(member)) {

      return interaction.reply({
        content:
          "❌ الـWarn متاح من رتبة Mod إلى Owner فقط.",
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
        content:
          "❌ العضو غير موجود.",
        ephemeral: true
      });
    }

    if (target.id === member.id) {

      return interaction.reply({
        content:
          "❌ لا يمكنك تحذير نفسك.",
        ephemeral: true
      });
    }

    // لا يستطيع الإداري معاقبة رتبة أعلى أو مساوية
    if (
      target.roles.highest.position >=
      member.roles.highest.position &&
      !isServerOwner(member)
    ) {

      return interaction.reply({
        content:
          "❌ لا يمكنك معاقبة شخص رتبته مساوية أو أعلى منك.",
        ephemeral: true
      });
    }

    const result =
      await applyWarn(
        target,
        member,
        reason
      );

    const embed = new EmbedBuilder()
      .setTitle("⚠️ Warning")
      .setDescription(
        `👤 العضو: <@${target.id}>\n` +
        `👮 المشرف: <@${member.id}>\n` +
        `📌 السبب: ${reason}\n\n` +
        `🔢 عدد التحذيرات: **${result.warns}**\n` +
        `⚡ الإجراء: **${result.action}**`
      )
      .setColor("Orange")
      .setTimestamp();

    return interaction.reply({
      embeds: [embed]
    });
  }

  // ==================================================
  // WARNINGS
  // ==================================================

  if (command === "warnings") {

    const target =
      interaction.options.getMember("user") ||
      member;

    return interaction.reply({
      content:
        `⚠️ تحذيرات <@${target.id}>: **${getWarns(target.id)}**`
    });
  }

  // ==================================================
  // KICK
  // ==================================================

  if (command === "kick") {

    if (!canModerate(member)) {

      return interaction.reply({
        content:
          "❌ الأمر متاح من Mod إلى Owner فقط.",
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
        content:
          "❌ العضو غير موجود.",
        ephemeral: true
      });
    }

    if (
      target.roles.highest.position >=
      member.roles.highest.position &&
      !isServerOwner(member)
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
          "❌ لا أستطيع طرد هذا العضو.",
        ephemeral: true
      });
    }

    await target.kick(reason);

    return interaction.reply(
      `👢 تم طرد <@${target.id}>.\nالسبب: ${reason}`
    );
  }

  // ==================================================
  // MUTE
  // ==================================================

  if (command === "mute") {

    if (!canModerate(member)) {

      return interaction.reply({
        content:
          "❌ الأمر متاح من Mod إلى Owner فقط.",
        ephemeral: true
      });
    }

    const target =
      interaction.options.getMember("user");

    const minutes =
      interaction.options.getInteger("minutes") || 10;

    if (!target) {

      return interaction.reply({
        content:
          "❌ العضو غير موجود.",
        ephemeral: true
      });
    }

    if (
      target.roles.highest.position >=
      member.roles.highest.position &&
      !isServerOwner(member)
    ) {

      return interaction.reply({
        content:
          "❌ لا يمكنك عمل Mute لشخص رتبته مساوية أو أعلى منك.",
        ephemeral: true
      });
    }

    if (!target.moderatable) {

      return interaction.reply({
        content:
          "❌ لا أستطيع عمل Mute لهذا العضو.",
        ephemeral: true
      });
    }

    await target.timeout(
      minutes * 60 * 1000,
      `Mute by ${member.user.tag}`
    );

    return interaction.reply(
      `🔇 تم عمل Mute لـ <@${target.id}> لمدة **${minutes} دقيقة**.`
    );
  }

  // ==================================================
  // BAN
  // ==================================================

  if (command === "ban") {

    if (!canModerate(member)) {

      return interaction.reply({
        content:
          "❌ الأمر متاح من Mod إلى Owner فقط.",
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
        content:
          "❌ العضو غير موجود.",
        ephemeral: true
      });
    }

    if (
      target.roles.highest.position >=
      member.roles.highest.position &&
      !isServerOwner(member)
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
          "❌ لا أستطيع حظر هذا العضو.",
        ephemeral: true
      });
    }

    await target.ban({
      deleteMessageSeconds: 86400,
      reason
    });

    return interaction.reply(
      `🔨 تم حظر <@${target.id}>.\nالسبب: ${reason}`
    );
  }

  // ==================================================
  // TICKET SETUP
  // ==================================================

  if (command === "ticket-setup") {

    // فقط صاحب السيرفر يستطيع إنشاء لوحة التكت
    if (!isServerOwner(member)) {

      return interaction.reply({
        content:
          "❌ فقط صاحب السيرفر يستطيع إنشاء نظام التذاكر.",
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("🎫 نظام التذاكر")
      .setDescription(
        "اضغط على الزر بالأسفل لفتح تذكرة.\n\n" +
        "📌 يمكنك فتح تذكرة واحدة فقط في نفس الوقت.\n" +
        "🔒 بعد إغلاقها يمكنك فتح تذكرة جديدة."
      )
      .setColor("Blue")
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId("open_ticket")
          .setLabel("فتح تذكرة")
          .setEmoji("🎫")
          .setStyle(ButtonStyle.Primary)
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
});

// ======================================================
// ERROR HANDLING
// ======================================================

process.on("unhandledRejection", error => {
  console.log("Unhandled Rejection:", error);
});

process.on("uncaughtException", error => {
  console.log("Uncaught Exception:", error);
});

// ======================================================
// LOGIN
// ======================================================

if (!TOKEN) {
  console.log("❌ TOKEN غير موجود في Environment Variables");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.log("❌ CLIENT_ID غير موجود في Environment Variables");
  process.exit(1);
}

client.login(TOKEN);
