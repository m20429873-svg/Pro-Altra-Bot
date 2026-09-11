const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const fs = require("fs");

// =====================================================
// CONFIG
// =====================================================

const TOKEN = process.env.TOKEN;

// عنوان السيرفر
const SERVER_IP = "Coper-_-crfte.aternos.me:31246";
const SERVER_PORT = "31246";

// مدة انتظار الرسائل
const MESSAGE_COOLDOWN = 10 * 1000;

// مدة البان
const BAN_TIME = 24 * 60 * 60 * 1000;

// =====================================================
// الرتب بالضبط كما عندك في السيرفر
// =====================================================

const ROLES = {
  PLAYER: "player",

  STAFF: [
    "Trial",
    "Helper",
    "Sr Helper",
    "Mod",
    "Sr Mod",
    "Jr Admin",
    "Admin",
    "Co Owner",
    "Hp Owner",
    "Owner"
  ]
};

// =====================================================
// نظام النقاط
// =====================================================

// المطلوب للوصول للرتبة التالية
const PROMOTIONS = [
  { from: "Trial", to: "Helper", points: 100 },
  { from: "Helper", to: "Sr Helper", points: 200 },
  { from: "Sr Helper", to: "Mod", points: 300 },
  { from: "Mod", to: "Sr Mod", points: 400 },
  { from: "Sr Mod", to: "Jr Admin", points: 500 },
  { from: "Jr Admin", to: "Admin", points: 600 },
  { from: "Admin", to: "Co Owner", points: 700 },
  { from: "Co Owner", to: "Hp Owner", points: 800 },
  { from: "Hp Owner", to: "Owner", points: 900 }
];

// =====================================================
// DATABASE JSON
// =====================================================

const DATA_FILE = "./jafa-data.json";

let data = {
  points: {},
  warns: {},
  tickets: {}
};

if (fs.existsSync(DATA_FILE)) {
  try {
    data = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );
  } catch {
    console.log("⚠️ Database damaged, creating new database.");
  }
}

if (!data.points) data.points = {};
if (!data.warns) data.warns = {};
if (!data.tickets) data.tickets = {};

function saveData() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2)
  );
}

// =====================================================
// CLIENT
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =====================================================
// HELPERS
// =====================================================

function getRole(member, roleName) {
  return member.guild.roles.cache.find(
    r => r.name.toLowerCase() === roleName.toLowerCase()
  );
}

function hasRole(member, roleName) {
  return member.roles.cache.some(
    r => r.name.toLowerCase() === roleName.toLowerCase()
  );
}

// =====================================================
// مستوى الإدارة
// =====================================================

const STAFF_LEVELS = [
  "Trial",
  "Helper",
  "Sr Helper",
  "Mod",
  "Sr Mod",
  "Jr Admin",
  "Admin",
  "Co Owner",
  "Hp Owner",
  "Owner"
];

function getStaffLevel(member) {
  for (let i = STAFF_LEVELS.length - 1; i >= 0; i--) {
    if (hasRole(member, STAFF_LEVELS[i])) {
      return i;
    }
  }

  return -1;
}

function isStaff(member) {
  return getStaffLevel(member) >= 0;
}

function isModerator(member) {
  // Mod إلى Owner
  const level = getStaffLevel(member);

  // Mod index = 3
  return level >= 3;
}

function isOwner(member) {
  return hasRole(member, "Owner");
}

// =====================================================
// النقاط
// =====================================================

function getPoints(userId) {
  return data.points[userId] || 0;
}

function setPoints(userId, amount) {
  data.points[userId] = Math.max(0, amount);
  saveData();
}

function addPoints(userId, amount) {
  data.points[userId] =
    (data.points[userId] || 0) + amount;

  saveData();

  return data.points[userId];
}

function removePoints(userId, amount) {
  data.points[userId] =
    Math.max(
      0,
      (data.points[userId] || 0) - amount
    );

  saveData();

  return data.points[userId];
}

// =====================================================
// التحقق من الترقية
// =====================================================

async function checkPromotion(member) {
  if (!member || !member.guild) return;

  const currentLevel = getStaffLevel(member);

  if (currentLevel < 0) return;

  const currentRole = STAFF_LEVELS[currentLevel];

  const promotion = PROMOTIONS.find(
    p => p.from === currentRole
  );

  if (!promotion) return;

  const points = getPoints(member.id);

  if (points < promotion.points) return;

  const oldRole = getRole(
    member,
    promotion.from
  );

  const newRole = getRole(
    member,
    promotion.to
  );

  if (!newRole) {
    console.log(
      `❌ Role not found: ${promotion.to}`
    );
    return;
  }

  try {

    // إزالة الرتبة القديمة
    if (oldRole) {
      await member.roles.remove(oldRole);
    }

    // إضافة الرتبة الجديدة
    await member.roles.add(newRole);

    // تصفير النقاط بعد الترقية
    setPoints(member.id, 0);

    const channel = member.guild.systemChannel;

    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle("🎉 ترقية إدارية")
        .setDescription(
          `${member}\n\n` +
          `مبروك! تمت ترقيتك تلقائياً من **${promotion.from}** إلى **${promotion.to}** 🎉\n\n` +
          `⭐ تم تصفير نقاطك وبدأت من جديد.`
        )
        .setTimestamp();

      channel.send({
        embeds: [embed]
      }).catch(() => {});
    }

    console.log(
      `⬆️ ${member.user.tag}: ${promotion.from} -> ${promotion.to}`
    );

  } catch (err) {
    console.log("Promotion error:", err);
  }
}

// =====================================================
// WARN DATABASE
// =====================================================

function getWarns(userId) {
  return data.warns[userId] || 0;
}

function addWarn(userId) {
  data.warns[userId] =
    (data.warns[userId] || 0) + 1;

  saveData();

  return data.warns[userId];
}

// =====================================================
// READY
// =====================================================

client.once("ready", () => {
  console.log("=================================");
  console.log(`✅ JAFA ONLINE`);
  console.log(`🤖 ${client.user.tag}`);
  console.log(`🌐 ${SERVER_IP}`);
  console.log("=================================");

  client.user.setActivity("Coper-Crte", {
    type: 3
  });
});

// =====================================================
// MEMBER JOIN
// =====================================================

client.on("guildMemberAdd", async member => {

  try {

    // ---------------------------------------------
    // إعطاء player
    // ---------------------------------------------

    const playerRole = getRole(
      member,
      ROLES.PLAYER
    );

    if (playerRole) {
      if (!member.roles.cache.has(playerRole.id)) {
        await member.roles.add(playerRole);
      }
    }

    // ---------------------------------------------
    // الترحيب
    // ---------------------------------------------

    const channel =
      member.guild.systemChannel ||
      member.guild.channels.cache.find(
        c =>
          c.type === ChannelType.GuildText &&
          c.permissionsFor(
            member.guild.members.me
          )?.has(
            PermissionsBitField.Flags.SendMessages
          )
      );

    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle("🌟 مرحباً بك!")
      .setDescription(
        `${member}\n\n` +
        `🎉 سعيدين بانضمامك إلى سيرفر **${member.guild.name}**\n\n` +
        `🚀 استمتع بالفعاليات والتحديات\n` +
        `📖 لا تنسَ الاطلاع على القوانين\n\n` +
        `✨ نتمنى لك إقامة ممتعة بيننا!`
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    await channel.send({
      embeds: [embed]
    });

  } catch (err) {
    console.log("Join error:", err);
  }
});

// =====================================================
// MESSAGE COOLDOWN
// =====================================================

const cooldowns = new Map();

function isCooldownExempt(member) {

  // صاحب السيرفر
  if (
    member.guild.ownerId === member.id
  ) {
    return true;
  }

  // Owner
  if (isOwner(member)) {
    return true;
  }

  return false;
}

// =====================================================
// MESSAGE CREATE
// =====================================================

client.on("messageCreate", async message => {

  if (message.author.bot) return;

  if (!message.guild) return;

  const member = message.member;

  // =================================================
  // IP
  // =================================================

  if (
    message.content.trim().toLowerCase() === "ip"
  ) {

    return message.reply(
      `JAFA: ${SERVER_IP}\nPort: ${SERVER_PORT}`
    );
  }

  // =================================================
  // ANTI SPAM
  // =================================================

  if (!isCooldownExempt(member)) {

    const now = Date.now();

    const last =
      cooldowns.get(member.id) || 0;

    const remaining =
      MESSAGE_COOLDOWN - (now - last);

    if (remaining > 0) {

      const seconds =
        Math.ceil(remaining / 1000);

      try {
        await message.delete();
      } catch {}

      const warning =
        await message.channel.send(
          `${member} ⏱️ انتظر **${seconds} ثانية** قبل إرسال رسالة أخرى.`
        );

      setTimeout(() => {
        warning.delete().catch(() => {});
      }, 3000);

      return;
    }

    cooldowns.set(
      member.id,
      now
    );
  }

  // =================================================
  // نقاط العضو
  // =================================================

  if (
    message.content.toLowerCase().startsWith("نقاط")
  ) {

    const target =
      message.mentions.members.first() ||
      member;

    const points =
      getPoints(target.id);

    const level =
      getStaffLevel(target);

    if (level < 0) {

      return message.reply(
        `👤 ${target}\n⭐ النقاط: **${points}**\n🏷️ الرتبة: **player**`
      );
    }

    const role =
      STAFF_LEVELS[level];

    const promotion =
      PROMOTIONS.find(
        p => p.from === role
      );

    if (!promotion) {

      return message.reply(
        `👑 ${target}\n` +
        `🏷️ الرتبة: **${role}**\n` +
        `⭐ النقاط: **${points}**\n` +
        `🏆 وصلت إلى أعلى رتبة.`
      );
    }

    const remaining =
      Math.max(
        0,
        promotion.points - points
      );

    return message.reply(
      `👤 ${target}\n\n` +
      `🏷️ الرتبة: **${role}**\n` +
      `⭐ النقاط: **${points}**\n` +
      `⬆️ الترقية القادمة: **${promotion.to}**\n` +
      `🎯 المتبقي: **${remaining}** نقطة`
    );
  }

  // =================================================
  // ADD POINTS
  // =================================================

  if (
    message.content
      .toLowerCase()
      .startsWith("اضف_نقاط")
  ) {

    if (!isOwner(member)) {
      return message.reply(
        "❌ هذا الأمر للـ Owner فقط."
      );
    }

    const target =
      message.mentions.members.first();

    if (!target) {
      return message.reply(
        "❌ منشن الشخص.\nمثال: `اضف_نقاط @user 50`"
      );
    }

    // ممنوع يعطي نفسه
    if (
      target.id === member.id
    ) {
      return message.reply(
        "❌ لا يمكنك إعطاء نقاط لنفسك."
      );
    }

    // ممنوع تعديل Owner
    if (isOwner(target)) {
      return message.reply(
        "❌ لا يمكنك تعديل نقاط Owner."
      );
    }

    const args =
      message.content.trim().split(/\s+/);

    const amount =
      Number(args[2]);

    if (
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return message.reply(
        "❌ اكتب عدد نقاط صحيح."
      );
    }

    const points =
      addPoints(
        target.id,
        amount
      );

    await checkPromotion(target);

    return message.reply(
      `✅ تمت إضافة **${amount}** نقطة إلى ${target}.\n` +
      `⭐ النقاط الحالية: **${points}**`
    );
  }

  // =================================================
  // REMOVE POINTS
  // =================================================

  if (
    message.content
      .toLowerCase()
      .startsWith("خصم_نقاط")
  ) {

    if (!isOwner(member)) {
      return message.reply(
        "❌ هذا الأمر للـ Owner فقط."
      );
    }

    const target =
      message.mentions.members.first();

    if (!target) {
      return message.reply(
        "❌ منشن الشخص.\nمثال: `خصم_نقاط @user 50`"
      );
    }

    if (
      target.id === member.id
    ) {
      return message.reply(
        "❌ لا يمكنك تعديل نقاط نفسك."
      );
    }

    // Owner لا يتم تعديل نقاطه
    if (isOwner(target)) {
      return message.reply(
        "❌ لا يمكنك تعديل نقاط Owner."
      );
    }

    const args =
      message.content.trim().split(/\s+/);

    const amount =
      Number(args[2]);

    if (
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return message.reply(
        "❌ اكتب عدد نقاط صحيح."
      );
    }

    const points =
      removePoints(
        target.id,
        amount
      );

    return message.reply(
      `✅ تم خصم **${amount}** نقطة من ${target}.\n` +
      `⭐ النقاط الحالية: **${points}**`
    );
  }

  // =================================================
  // WARN
  // =================================================

  if (
    message.content
      .toLowerCase()
      .startsWith("warn")
  ) {

    if (!isModerator(member)) {
      return message.reply(
        "❌ الـWarn متاح من رتبة **Mod** إلى **Owner** فقط."
      );
    }

    const target =
      message.mentions.members.first();

    if (!target) {
      return message.reply(
        "❌ منشن الشخص.\nمثال: `warn @user السبب`"
      );
    }

    if (
      target.id === member.id
    ) {
      return message.reply(
        "❌ لا يمكنك عمل Warn لنفسك."
      );
    }

    // لا يستطيع إداري منخفض تحذير إداري أعلى منه
    const targetLevel =
      getStaffLevel(target);

    const moderatorLevel =
      getStaffLevel(member);

    if (
      targetLevel >= 0 &&
      targetLevel >= moderatorLevel
    ) {
      return message.reply(
        "❌ لا يمكنك اتخاذ إجراء ضد إداري أعلى منك أو مساوي لك."
      );
    }

    const warns =
      addWarn(target.id);

    // ---------------------------------------------
    // Warn 1
    // ---------------------------------------------

    if (warns === 1) {

      return message.reply(
        `⚠️ ${target} أخذ **Warn 1**.\n` +
        `📌 السبب: ${message.content
          .split(/\s+/)
          .slice(2)
          .join(" ") || "بدون سبب"}`
      );
    }

    // ---------------------------------------------
    // Warn 2 = Mute
    // ---------------------------------------------

    if (warns === 2) {

      try {

        await target.timeout(
          10 * 60 * 1000,
          "Warn 2"
        );

        return message.reply(
          `🔇 ${target} أخذ **Warn 2** وتم عمل Mute لمدة **10 دقائق**.`
        );

      } catch {

        return message.reply(
          `⚠️ ${target} أخذ Warn 2 لكن البوت لا يستطيع عمل Mute.`
        );
      }
    }

    // ---------------------------------------------
    // Warn 3 = Kick
    // ---------------------------------------------

    if (warns === 3) {

      try {

        await target.kick(
          "Warn 3"
        );

        return message.reply(
          `👢 ${target.user.tag} أخذ **Warn 3** وتم طرده من السيرفر.`
        );

      } catch {

        return message.reply(
          "❌ البوت لا يستطيع Kick لهذا العضو."
        );
      }
    }

    // ---------------------------------------------
    // Warn 4 = Ban 1 day
    // ---------------------------------------------

    if (warns >= 4) {

      try {

        await target.ban({
          deleteMessageSeconds: 0,
          reason: "Warn 4 - Ban 1 Day"
        });

        return message.reply(
          `🔨 ${target.user.tag} أخذ **Warn 4** وتم حظره لمدة يوم.`
        );

      } catch {

        return message.reply(
          "❌ البوت لا يستطيع Ban لهذا العضو."
        );
      }
    }
  }

  // =================================================
  // WARNS
  // =================================================

  if (
    message.content
      .toLowerCase()
      .startsWith("تحذيرات")
  ) {

    const target =
      message.mentions.members.first() ||
      member;

    const warns =
      getWarns(target.id);

    return message.reply(
      `⚠️ ${target}\nعدد التحذيرات: **${warns}/4**`
    );
  }

  // =================================================
  // TICKET SETUP
  // Owner فقط
  // =================================================

  if (
    message.content.toLowerCase() ===
    "setup-ticket"
  ) {

    if (!isOwner(member)) {
      return message.reply(
        "❌ صاحب السيرفر / Owner فقط يستطيع إنشاء لوحة التكت."
      );
    }

    const embed = new EmbedBuilder()
      .setTitle("🎫 نظام التذاكر")
      .setDescription(
        "اضغط على الزر أدناه لفتح تذكرة.\n\n" +
        "⚠️ مسموح لكل شخص بتذكرة واحدة فقط في نفس الوقت."
      )
      .setTimestamp();

    const row =
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("open_ticket")
          .setLabel("فتح تذكرة")
          .setEmoji("🎫")
          .setStyle(ButtonStyle.Primary)
      );

    return message.channel.send({
      embeds: [embed],
      components: [row]
    });
  }

  // =================================================
  // HELP
  // =================================================

  if (
    message.content.toLowerCase() ===
    "help"
  ) {

    return message.reply(
      "📋 **JAFA BOT**\n\n" +
      "`ip` → عنوان السيرفر\n" +
      "`نقاط` → نقاطك\n" +
      "`نقاط @user` → نقاط عضو\n" +
      "`تحذيرات @user` → التحذيرات\n\n" +
      "**Owner:**\n" +
      "`اضف_نقاط @user 50`\n" +
      "`خصم_نقاط @user 50`\n" +
      "`setup-ticket`\n\n" +
      "**Mod → Owner:**\n" +
      "`warn @user السبب`"
    );
  }
});

// =====================================================
// BUTTONS
// =====================================================

client.on(
  "interactionCreate",
  async interaction => {

    if (!interaction.isButton()) return;

    if (
      interaction.customId !==
      "open_ticket"
    ) return;

    const guild =
      interaction.guild;

    const member =
      interaction.member;

    // ===============================================
    // البحث عن تكت العضو
    // ===============================================

    const existing =
      guild.channels.cache.find(
        channel =>
          channel.type === ChannelType.GuildText &&
          channel.topic ===
            `JAFA_TICKET_${member.id}`
      );

    if (existing) {

      return interaction.reply({
        content:
          `❌ لديك تذكرة مفتوحة بالفعل: ${existing}`,
        ephemeral: true
      });
    }

    // ===============================================
    // إيجاد/إنشاء Category
    // ===============================================

    let category =
      guild.channels.cache.find(
        channel =>
          channel.type ===
            ChannelType.GuildCategory &&
          channel.name.toLowerCase() ===
            "tickets"
      );

    if (!category) {

      try {

        category =
          await guild.channels.create({
            name: "Tickets",
            type: ChannelType.GuildCategory
          });

      } catch {

        return interaction.reply({
          content:
            "❌ البوت لا يستطيع إنشاء Category.",
          ephemeral: true
        });
      }
    }

    // ===============================================
    // إنشاء التكت
    // ===============================================

    try {

      const ticket =
        await guild.channels.create({
          name:
            `ticket-${member.user.username}`
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, "")
              .slice(0, 25) ||
            `ticket-${member.id}`,

          type: ChannelType.GuildText,

          parent: category.id,

          topic:
            `JAFA_TICKET_${member.id}`,

          permissionOverwrites: [

            {
              id: guild.id,

              deny: [
                PermissionsBitField.Flags.ViewChannel
              ]
            },

            {
              id: member.id,

              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
              ]
            },

            {
              id: client.user.id,

              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.ReadMessageHistory
              ]
            }

          ]
        });

      // =============================================
      // السماح للإدارة Mod → Owner
      // =============================================

      for (
        const roleName of STAFF_LEVELS
      ) {

        const role =
          getRole(
            guild.members.me,
            roleName
          );

        if (
          role &&
          STAFF_LEVELS.indexOf(roleName) >= 3
        ) {

          await ticket.permissionOverwrites
            .edit(role.id, {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true,
              ManageChannels: true
            })
            .catch(() => {});
        }
      }

      // =============================================
      // Ticket Message
      // =============================================

      const embed =
        new EmbedBuilder()
          .setTitle("🎫 تذكرتك")
          .setDescription(
            `مرحباً ${member} 👋\n\n` +
            `تم فتح تذكرتك بنجاح.\n` +
            `انتظر أحد أعضاء الإدارة لمساعدتك.\n\n` +
            `🔒 الإدارة من **Mod → Owner** تستطيع إغلاق التذكرة.`
          )
          .setTimestamp();

      const row =
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId("close_ticket")
              .setLabel("إغلاق التذكرة")
              .setEmoji("🔒")
              .setStyle(ButtonStyle.Danger)
          );

      await ticket.send({
        content: `${member}`,
        embeds: [embed],
        components: [row]
      });

      return interaction.reply({
        content:
          `✅ تم فتح تذكرتك: ${ticket}`,
        ephemeral: true
      });

    } catch (err) {

      console.log(
        "Ticket create error:",
        err
      );

      return interaction.reply({
        content:
          "❌ حدث خطأ أثناء إنشاء التذكرة.",
        ephemeral: true
      });
    }
  }
);

// =====================================================
// CLOSE TICKET
// =====================================================

client.on(
  "interactionCreate",
  async interaction => {

    if (!interaction.isButton()) return;

    if (
      interaction.customId !==
      "close_ticket"
    ) return;

    const member =
      interaction.member;

    // -----------------------------------------------
    // فقط Mod → Owner
    // -----------------------------------------------

    if (!isModerator(member)) {

      return interaction.reply({
        content:
          "❌ فقط الإدارة من Mod إلى Owner تستطيع إغلاق التذكرة.",
        ephemeral: true
      });
    }

    const channel =
      interaction.channel;

    if (
      !channel.topic ||
      !channel.topic.startsWith(
        "JAFA_TICKET_"
      )
    ) {

      return interaction.reply({
        content:
          "❌ هذه ليست تذكرة.",
        ephemeral: true
      });
    }

    await interaction.reply(
      "🔒 سيتم إغلاق التذكرة خلال 3 ثواني..."
    );

    setTimeout(async () => {

      try {
        await channel.delete();
      } catch {}

    }, 3000);
  }
);

// =====================================================
// ERROR HANDLING
// =====================================================

process.on(
  "unhandledRejection",
  error => {
    console.log(
      "Unhandled Rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {
    console.log(
      "Uncaught Exception:",
      error
    );
  }
);

// =====================================================
// LOGIN
// =====================================================

client.login(TOKEN);
