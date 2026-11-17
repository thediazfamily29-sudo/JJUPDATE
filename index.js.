const express = require("express");
const crypto = require("crypto");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

const app = express();

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CHANNEL_ID || !WEBHOOK_SECRET) {
  console.error("Missing environment variables.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

app.get("/", (req, res) => {
  res.send("JJUPDATE is online.");
});

app.get("/health", (req, res) => {
  res.json({ status: "online" });
});

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
      crypto
        .createHmac("sha256", WEBHOOK_SECRET)
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

client.once("clientReady", () => {
  console.log(`JJUPDATE online as ${client.user.tag}`);

  app.listen(PORT, () => {
    console.log(`JJUPDATE listening on port ${PORT}`);
  });
});

client.login(TOKEN);
