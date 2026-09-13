require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField
} = require("discord.js");

// ======================================================
// CONFIG
// ======================================================

const TOKEN = process.env.TOKEN;

// ID سيرفرك
const GUILD_ID = "1548054046387085424";

// ======================================================
// CLIENT
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

// ======================================================
// VELORA SERVER STRUCTURE
// ======================================================

const structure = [

  // 📜 مجلس فيلورا
  {
    category: "📜・مَجْلِسُ فِيلورا",
    channels: [
      "👋・الترحيب",
      "📖・القوانين",
      "📢・الإعلانات",
      "📌・المعلومات"
    ]
  },

  // 💬 مجلس الأعضاء
  {
    category: "💬・مَجْلِسُ الأعضاء",
    channels: [
      "💬・العام",
      "🤍・التعارف",
      "😂・الترفيه",
      "📸・الصور",
      "🎥・المقاطع"
    ]
  },

  // ⛏️ عالم ماينكرافت
  {
    category: "⛏️・عَالَمُ مَاينكرافت",
    channels: [
      "🌍・دخول_السيرفر",
      "📢・أخبار_السيرفر",
      "🗺️・خريطة_العالم",
      "🏆・المتصدرين",
      "⚔️・المعارك",
      "🏰・المدن_والقبائل",
      "💰・الاقتصاد",
      "🛒・المتجر"
    ]
  },

  // 🕌 المجلس الإيماني
  {
    category: "🕌・المَجْلِسُ الإيماني",
    channels: [
      "📖・آية_اليوم",
      "🌙・تذكير_يومي",
      "🤲・الأذكار",
      "🕋・مواسم_الخير",
      "💭・فوائد_إيمانية"
    ]
  },

  // 🎫 خدمة الأعضاء
  {
    category: "🎫・خِدْمَةُ الأعضاء",
    channels: [
      "🎫・فتح_تذكرة",
      "🚨・بلاغات",
      "💡・الاقتراحات",
      "❓・المساعدة"
    ]
  },

  // 🔊 مجالس الصوت
  {
    category: "🔊・مَجَالِسُ الصَّوت",
    channels: [
      {
        name: "🎙️・المجلس_العام",
        type: "voice"
      },
      {
        name: "🎮・مجلس_الألعاب",
        type: "voice"
      },
      {
        name: "⛏️・مجلس_ماينكرافت",
        type: "voice"
      },
      {
        name: "🌙・جلسة_هادئة",
        type: "voice"
      },
      {
        name: "🔒・مجلس_الإدارة",
        type: "voice"
      }
    ]
  },

  // 👑 إدارة فيلورا
  {
    category: "👑・إدارةُ فِيلورا",
    private: true,

    channels: [
      "📋・سجل_الإدارة",
      "🛡️・سجل_الإشراف",
      "🤖・أوامر_البوت",
      "📊・إحصائيات_السيرفر"
    ]
  }
];

// ======================================================
// CREATE CATEGORY
// ======================================================

async function createCategory(guild, categoryData) {

  let category = guild.channels.cache.find(
    channel =>
      channel.type === ChannelType.GuildCategory &&
      channel.name === categoryData.category
  );

  // إذا الكاتيجوري موجودة
  if (category) {

    console.log(`📁 موجودة مسبقًا: ${category.name}`);

  } else {

    const permissions = [];

    // 👑 كاتيجوري الإدارة تكون مخفية
    if (categoryData.private) {

      permissions.push({
        id: guild.roles.everyone.id,
        deny: [
          PermissionsBitField.Flags.ViewChannel
        ]
      });

    }

    category = await guild.channels.create({
      name: categoryData.category,
      type: ChannelType.GuildCategory,
      permissionOverwrites: permissions
    });

    console.log(`✅ تم إنشاء: ${category.name}`);
  }

  // ====================================================
  // CREATE CHANNELS
  // ====================================================

  for (const channelData of categoryData.channels) {

    const name =
      typeof channelData === "string"
        ? channelData
        : channelData.name;

    const type =
      typeof channelData === "string"
        ? ChannelType.GuildText
        : channelData.type === "voice"
          ? ChannelType.GuildVoice
          : ChannelType.GuildText;

    // البحث عن الغرفة داخل نفس الكاتيجوري
    const existing = guild.channels.cache.find(
      channel =>
        channel.parentId === category.id &&
        channel.name === name &&
        channel.type === type
    );

    if (existing) {

      console.log(`   ↳ موجودة: ${name}`);
      continue;

    }

    const permissions = [];

    // 🔒 إخفاء غرف الإدارة
    if (categoryData.private) {

      permissions.push({
        id: guild.roles.everyone.id,
        deny: [
          PermissionsBitField.Flags.ViewChannel
        ]
      });

    }

    await guild.channels.create({
      name,
      type,
      parent: category.id,
      permissionOverwrites: permissions
    });

    console.log(`   ↳ ✅ تم إنشاء: ${name}`);
  }
}

// ======================================================
// SETUP VELORA
// ======================================================

async function setupVelora(guild) {

  console.log("");
  console.log("╭━━━━━━━━━━━━━━━━━━━━━━╮");
  console.log("      🌙・فِيلورا");
  console.log("╰━━━━━━━━━━━━━━━━━━━━━━╯");
  console.log("");

  for (const category of structure) {

    try {

      await createCategory(
        guild,
        category
      );

    } catch (error) {

      console.error(
        `❌ خطأ في ${category.category}:`,
        error.message
      );

    }
  }

  console.log("");
  console.log("╭━━━━━━━━━━━━━━━━━━━━━━╮");
  console.log("      ✅ تم تجهيز فيلورا");
  console.log("╰━━━━━━━━━━━━━━━━━━━━━━╯");
  console.log("");
}

// ======================================================
// BOT READY
// ======================================================

client.once("ready", async () => {

  console.log("");
  console.log("🤖 البوت اشتغل!");
  console.log(`👤 ${client.user.tag}`);

  const guild = client.guilds.cache.get(
    GUILD_ID
  );

  if (!guild) {

    console.log("");
    console.log("❌ لم أجد السيرفر!");
    console.log("تأكد من GUILD_ID");
    return
