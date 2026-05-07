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
const CATEGORY_CANDIDATURES  = process.env.CATEGORY_CANDIDATURES;
const CATEGORY_PORT_ARMES    = process.env.CATEGORY_PORT_ARMES;
const ROLE_RH_ID             = process.env.ROLE_RH_ID;
const ROLE_ARMES_ID          = process.env.ROLE_ARMES_ID;
const PORT                   = process.env.PORT || 3000;
const API_SECRET             = process.env.API_SECRET;

// ── Discord Client ───────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
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
  origin: '*',
  methods: ['POST'],
}));

function checkSecret(req, res, next) {
  const secret = req.headers['x-api-secret'];
  if (API_SECRET && secret !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Helper : retrouver un membre par son pseudo Discord ──
async function findMemberByUsername(guild, discordInput) {
  const clean = discordInput.replace(/^@/, '').trim().toLowerCase();

  // Fetch ciblé via l'API Discord (plus fiable)
  try {
    const members = await guild.members.fetch({ query: clean, limit: 5 });
    const member = members.find(m =>
      m.user.username.toLowerCase() === clean ||
      m.displayName.toLowerCase() === clean ||
      m.user.globalName?.toLowerCase() === clean
    );
    if (member) return member;
  } catch (e) {
    console.warn('⚠️ Fetch par query échoué :', e.message);
  }

  // Fallback : fetch complet
  try {
    await guild.members.fetch();
    console.log('🔍 Recherche membre pour :', clean);
    console.log('👥 Membres en cache :', guild.members.cache.map(m => m.user.username).join(', '));
    return guild.members.cache.find(m =>
      m.user.username.toLowerCase() === clean ||
      m.displayName.toLowerCase() === clean ||
      m.user.globalName?.toLowerCase() === clean
    ) || null;
  } catch (e) {
    console.warn('⚠️ Fetch complet échoué :', e.message);
    return null;
  }
}

// ── Helper : construire les permissionOverwrites ─────────
function buildOverwrites(guild, roleId, member) {
  const overwrites = [
    {
      id: guild.roles.everyone,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
  ];

  if (roleId) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  // ✅ FIX : ajouter le membre qui a soumis le formulaire
  if (member) {
    overwrites.push({
      id: member.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  return overwrites;
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

    // Chercher le membre Discord
    const member = await findMemberByUsername(guild, discord);
    if (!member) {
      console.warn(`⚠️ Membre introuvable sur le serveur : ${discord}`);
    }

    const safeName = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 40);
    const channelName = `📋-${safeName}`;

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: CATEGORY_CANDIDATURES || null,
      topic: `Dossier ${dossier} — Candidature de ${name}`,
      permissionOverwrites: buildOverwrites(guild, ROLE_RH_ID, member),
    });

    const embed = new EmbedBuilder()
      .setTitle('🚔 Nouvelle Candidature LSPD')
      .setColor(0xC8A84B)
      .setThumbnail('https://upload.skybot.fr/uploads/sky_69fadf3a06f892.72502106.webp')
      .addFields(
        { name: '👤 Nom RP',       value: name,                          inline: true },
        { name: '🎮 Discord',      value: discord,                       inline: true },
        { name: '🖥️ FiveM',        value: fivem,                         inline: true },
        { name: '🎂 Âge',          value: String(age),                   inline: true },
        { name: '📋 Expérience',   value: experience || 'Non renseignée', inline: true },
        { name: '📄 N° Dossier',   value: `\`${dossier}\``,              inline: true },
        { name: '💬 Motivation',   value: motivation.slice(0, 1024) },
      )
      .setFooter({ text: `LSPD Recrutement · ${new Date().toLocaleString('fr-FR')}` })
      .setTimestamp();

    const pingMsg = ROLE_RH_ID ? `<@&${ROLE_RH_ID}>` : '📋 Nouveau dossier à traiter';
    // Mentionner le candidat s'il a été trouvé
    const candidatMention = member ? ` · Candidat : <@${member.id}>` : ` · Candidat : ${discord}`;
    await channel.send({ content: pingMsg + candidatMention, embeds: [embed] });

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

    console.log(`✅ Salon candidature créé : ${channelName} (${channel.id}) — Membre trouvé : ${member ? member.user.tag : 'non'}`);
    res.json({ success: true, channel: channelName, channelId: channel.id, memberFound: !!member });

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

    // Chercher le membre Discord
    const member = await findMemberByUsername(guild, discord);
    if (!member) {
      console.warn(`⚠️ Membre introuvable sur le serveur : ${discord}`);
    }

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
      permissionOverwrites: buildOverwrites(guild, ROLE_ARMES_ID, member),
    });

    const embed = new EmbedBuilder()
      .setTitle("🔫 Demande de Permis de Port d'Armes")
      .setColor(0xDC2626)
      .setThumbnail('https://upload.skybot.fr/uploads/sky_69fadf3a06f892.72502106.webp')
      .addFields(
        { name: '👤 Nom RP',         value: name,                        inline: true },
        { name: '🎮 Discord',        value: discord,                     inline: true },
        { name: "🔫 Type d'arme",    value: arme,                        inline: true },
        { name: '📋 Motif',          value: motif,                       inline: true },
        { name: '📄 Réf. demande',   value: `\`${ref}\``,                inline: true },
        { name: '💬 Justification',  value: justification.slice(0, 1024) },
      )
      .setFooter({ text: `LSPD Port d'Armes · ${new Date().toLocaleString('fr-FR')}` })
      .setTimestamp();

    const pingMsg = ROLE_ARMES_ID ? `<@&${ROLE_ARMES_ID}>` : '🔫 Nouvelle demande de permis';
    const demandeurMention = member ? ` · Demandeur : <@${member.id}>` : ` · Demandeur : ${discord}`;
    await channel.send({ content: pingMsg + demandeurMention, embeds: [embed] });

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

    console.log(`✅ Salon permit créé : ${channelName} (${channel.id}) — Membre trouvé : ${member ? member.user.tag : 'non'}`);
    res.json({ success: true, channel: channelName, channelId: channel.id, memberFound: !!member });

  } catch (err) {
    console.error('❌ Erreur /permit :', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ─────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'LSPD Bot online ✅' }));

// ── Démarrage ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌐 Serveur Express sur le port ${PORT}`);
});

client.login(BOT_TOKEN);
