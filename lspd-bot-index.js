// ══════════════════════════════════════════════════════════
//  LSPD BOT — Création de salons Discord automatique
//  Candidatures & Permis de Port d'Armes
// ══════════════════════════════════════════════════════════

const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, ChannelType } = require('discord.js');
const express = require('express');
const cors    = require('cors');
require('dotenv').config();

// ── Config ──────────────────────────────────────────────
const BOT_TOKEN              = process.env.BOT_TOKEN;
const GUILD_ID               = process.env.GUILD_ID;
const CATEGORY_CANDIDATURES  = process.env.CATEGORY_CANDIDATURES;  // ID catégorie candidatures
const CATEGORY_PORT_ARMES    = process.env.CATEGORY_PORT_ARMES;     // ID catégorie port d'armes
const ROLE_RH_ID             = process.env.ROLE_RH_ID;              // ID rôle RH à pinger
const ROLE_ARMES_ID          = process.env.ROLE_ARMES_ID;           // ID rôle qui gère les permits
const PORT                   = process.env.PORT || 3000;
const API_SECRET             = process.env.API_SECRET;              // Clé secrète pour sécuriser l'API

// ── Discord Client ───────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildChannels,
    GatewayIntentBits.GuildMessages,
  ]
});

client.once('ready', () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`);
  console.log(`📡 API en écoute sur le port ${PORT}`);
});

// ── Express API ──────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(cors({
  origin: '*', // Remplacez par l'URL de votre site en production
  methods: ['POST'],
}));

// Middleware de vérification du secret
function checkSecret(req, res, next) {
  const secret = req.headers['x-api-secret'];
  if (API_SECRET && secret !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─────────────────────────────────────────────────────────
//  ROUTE : Nouvelle candidature
//  POST /candidature
// ─────────────────────────────────────────────────────────
app.post('/candidature', checkSecret, async (req, res) => {
  try {
    const { name, discord, fivem, age, experience, motivation, dossier } = req.body;

    if (!name || !discord || !fivem || !age || !motivation) {
      return res.status(400).json({ error: 'Champs manquants' });
    }

    const guild = await client.guilds.fetch(GUILD_ID);

    // Créer un nom de salon propre : candidature-john-mitchell
    const safeName = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 40);
    const channelName = `📋-${safeName}`;

    // Créer le salon dans la catégorie candidatures
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: CATEGORY_CANDIDATURES || null,
      topic: `Dossier ${dossier} — Candidature de ${name}`,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        ...(ROLE_RH_ID ? [{
          id: ROLE_RH_ID,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        }] : []),
      ],
    });

    // Embed principal
    const embed = new EmbedBuilder()
      .setTitle('🚔 Nouvelle Candidature LSPD')
      .setColor(0xC8A84B)
      .setThumbnail('https://upload.skybot.fr/uploads/sky_69fadf3a06f892.72502106.webp')
      .addFields(
        { name: '👤 Nom RP',       value: name,                         inline: true },
        { name: '🎮 Discord',      value: discord,                      inline: true },
        { name: '🖥️ FiveM',        value: fivem,                        inline: true },
        { name: '🎂 Âge',          value: String(age),                  inline: true },
        { name: '📋 Expérience',   value: experience || 'Non renseignée', inline: true },
        { name: '📄 N° Dossier',   value: `\`${dossier}\``,             inline: true },
        { name: '💬 Motivation',   value: motivation.slice(0, 1024) },
      )
      .setFooter({ text: `LSPD Recrutement · ${new Date().toLocaleString('fr-FR')}` })
      .setTimestamp();

    // Message dans le salon
    const pingMsg = ROLE_RH_ID ? `<@&${ROLE_RH_ID}>` : '📋 Nouveau dossier à traiter';
    await channel.send({ content: pingMsg, embeds: [embed] });

    // Message d'instructions pour les RH
    await channel.send({
      content: [
        '**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**',
        '**📌 Actions disponibles :**',
        '✅ Réagir avec ✅ pour **accepter** la candidature',
        '❌ Réagir avec ❌ pour **refuser** la candidature',
        '📝 Utiliser ce salon pour les échanges avec le candidat',
        '🔒 Archiver le salon une fois la décision prise',
        '**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**',
      ].join('\n')
    });

    console.log(`✅ Salon candidature créé : ${channelName} (${channel.id})`);
    res.json({ success: true, channel: channelName, channelId: channel.id });

  } catch (err) {
    console.error('❌ Erreur /candidature :', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
//  ROUTE : Nouvelle demande de permis port d'armes
//  POST /permit
// ─────────────────────────────────────────────────────────
app.post('/permit', checkSecret, async (req, res) => {
  try {
    const { name, discord, arme, motif, justification, ref } = req.body;

    if (!name || !discord || !arme || !motif || !justification) {
      return res.status(400).json({ error: 'Champs manquants' });
    }

    const guild = await client.guilds.fetch(GUILD_ID);

    const safeName = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 40);
    const channelName = `🔫-ppa-${safeName}`;

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: CATEGORY_PORT_ARMES || null,
      topic: `Réf. ${ref} — Demande de port d'armes de ${name}`,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        ...(ROLE_ARMES_ID ? [{
          id: ROLE_ARMES_ID,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        }] : []),
      ],
    });

    const embed = new EmbedBuilder()
      .setTitle("🔫 Demande de Permis de Port d'Armes")
      .setColor(0xDC2626)
      .setThumbnail('https://upload.skybot.fr/uploads/sky_69fadf3a06f892.72502106.webp')
      .addFields(
        { name: '👤 Nom RP',         value: name,             inline: true },
        { name: '🎮 Discord',        value: discord,          inline: true },
        { name: "🔫 Type d'arme",    value: arme,             inline: true },
        { name: '📋 Motif',          value: motif,            inline: true },
        { name: '📄 Réf. demande',   value: `\`${ref}\``,     inline: true },
        { name: '💬 Justification',  value: justification.slice(0, 1024) },
      )
      .setFooter({ text: `LSPD Port d'Armes · ${new Date().toLocaleString('fr-FR')}` })
      .setTimestamp();

    const pingMsg = ROLE_ARMES_ID ? `<@&${ROLE_ARMES_ID}>` : '🔫 Nouvelle demande de permis';
    await channel.send({ content: pingMsg, embeds: [embed] });

    await channel.send({
      content: [
        '**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**',
        '**📌 Actions disponibles :**',
        '✅ `!permit accept` — Valider le permis',
        '❌ `!permit refuse` — Refuser la demande',
        '📝 Utiliser ce salon pour communiquer avec le demandeur',
        '**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**',
      ].join('\n')
    });

    console.log(`✅ Salon permit créé : ${channelName} (${channel.id})`);
    res.json({ success: true, channel: channelName, channelId: channel.id });

  } catch (err) {
    console.error('❌ Erreur /permit :', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Health check pour Railway ────────────────────────────
app.get('/', (req, res) => res.json({ status: 'LSPD Bot online ✅' }));

// ── Démarrage ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌐 Serveur Express sur le port ${PORT}`);
});

client.login(BOT_TOKEN);
