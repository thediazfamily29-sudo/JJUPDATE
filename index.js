const express = require("express");
const crypto = require("crypto");

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder
} = require("discord.js");

const app = express();

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const PORT = process.env.PORT || 3000;

const STAFF_ROLE_ID = "1557344028129890334";

if (!TOKEN || !CHANNEL_ID || !WEBHOOK_SECRET) {
  console.error("Missing environment variables.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Health checks
app.get("/", (req, res) => {
  res.send("JJUPDATE is online.");
});

app.get("/health", (req, res) => {
  res.json({ status: "online" });
});

// Slash command
const updateCommand = new SlashCommandBuilder()
  .setName("update")
  .setDescription("Publish a JJSTUDIOS update announcement.")
  .addStringOption(option =>
    option.setName("version")
      .setDescription("Update version, e.g. v1.0.2")
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName("title")
      .setDescription("Update title")
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName("changelog")
      .setDescription("Describe what changed")
      .setRequired(true)
  )
  .addBooleanOption(option =>
    option.setName("ping")
      .setDescription("Mention everyone?")
      .setRequired(false)
  );

// Handle slash commands
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "update") return;

  if (!interaction.inGuild()) {
    return interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true
    });
  }

  try {
    const member = await interaction.guild.members.fetch(
      interaction.user.id
    );

    if (!member.roles.cache.has(STAFF_ROLE_ID)) {
      return interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const version = interaction.options.getString("version");
    const title = interaction.options.getString("title");
    const changelog = interaction.options.getString("changelog");
    const ping = interaction.options.getBoolean("ping") ?? false;

    const channel = await client.channels.fetch(CHANNEL_ID);

    if (!channel || !channel.isTextBased()) {
      throw new Error("Announcement channel not found.");
    }

    const embed = new EmbedBuilder()
      .setColor(0xE8A6C8)
      .setTitle(title.slice(0, 256))
      .setDescription(changelog.slice(0, 4000))
      .addFields({
        name: "Version",
        value: version.slice(0, 100),
        inline: true
      })
      .setFooter({
        text: "JJSTUDIOS • Update System"
      })
      .setTimestamp();

    await channel.send({
      content: ping ? "@everyone" : undefined,
      embeds: [embed],
      allowedMentions: {
        parse: ping ? ["everyone"] : []
      }
    });

    await interaction.editReply({
      content: "Your update announcement was published successfully!"
    });

  } catch (error) {
    console.error("Update command failed:", error);

    if (interaction.deferred) {
      await interaction.editReply({
        content: "Something went wrong while publishing the update."
      }).catch(() => {});
    } else if (!interaction.replied) {
      await interaction.reply({
        content: "Something went wrong.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// GitHub webhook
app.post(
  "/github",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["x-hub-signature-256"];

    if (!signature || !Buffer.isBuffer(req.body)) {
      return res.status(401).send("Unauthorized");
    }

    const expected =
      "sha256=" +
      crypto.createHmac("sha256", WEBHOOK_SECRET)
        .update(req.body)
        .digest("hex");

    const received = Buffer.from(signature);
    const calculated = Buffer.from(expected);

    if (
      received.length !== calculated.length ||
      !crypto.timingSafeEqual(received, calculated)
    ) {
      return res.status(401).send("Invalid signature");
    }

    if (req.headers["x-github-event"] !== "release") {
      return res.status(200).send("Event ignored");
    }

    let payload;

    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res.status(400).send("Invalid JSON");
    }

    if (
      payload.action !== "published" ||
      payload.release?.draft ||
      payload.release?.prerelease
    ) {
      return res.status(200).send("Release ignored");
    }

    try {
      const release = payload.release;
      const repository = payload.repository?.full_name || "GitHub";

      const channel = await client.channels.fetch(CHANNEL_ID);

      if (!channel || !channel.isTextBased()) {
        throw new Error("Announcement channel not found.");
      }

      const embed = new EmbedBuilder()
        .setColor(0xE8A6C8)
        .setTitle(`${repository} — ${release.tag_name || "New Update"}`)
        .setDescription(
          (release.body || "No changelog provided.").slice(0, 4000)
        )
        .addFields(
          {
            name: "Version",
            value: String(release.tag_name || "New Release").slice(0, 100),
            inline: true
          },
          {
            name: "Repository",
            value: repository.slice(0, 100),
            inline: true
          },
          {
            name: "Release",
            value: `[View on GitHub](${release.html_url})`
          }
        )
        .setFooter({
          text: "JJSTUDIOS • Automatic Update System"
        })
        .setTimestamp();

      await channel.send({
        content: "@everyone",
        embeds: [embed],
        allowedMentions: {
          parse: ["everyone"]
        }
      });

      console.log(`Published update: ${repository} ${release.tag_name}`);

      return res.status(200).send("Announcement published.");

    } catch (error) {
      console.error("Announcement failed:", error);
      return res.status(500).send("Announcement failed.");
    }
  }
);

// Start bot and register commands
client.once("ready", async () => {
  console.log(`JJUPDATE online as ${client.user.tag}`);

  try {
    await client.application.commands.set([updateCommand]);
    console.log("Slash commands registered.");
  } catch (error) {
    console.error("Command registration failed:", error);
  }

  app.listen(PORT, () => {
    console.log(`JJUPDATE listening on port ${PORT}`);
  });
});

client.login(TOKEN);
