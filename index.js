const {
  Client,
  GatewayIntentBits
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`✅ JAFA Bot Online: ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content.trim().toLowerCase() === "ip") {
    await message.reply(
      "JAFA: Coper-_-crfte.aternos.me:31246\nPort: 31246"
    );
  }
});

client.login(process.env.TOKEN);
