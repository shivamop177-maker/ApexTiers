const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express(); // 👈 Must be right here at the top!
app.use(cors());
app.use(express.json());

// MongoDB Player Schema
const playerSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    uuid: { type: String, default: "" },
    region: { type: String, default: "NA" },
    tiers: { type: Map, of: String, default: {} }
});

const Player = mongoose.model('Player', playerSchema);

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI;
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('Connected to MongoDB successfully!'))
        .catch(err => console.error('MongoDB connection error:', err));
}

// 1. GET API - Fetch all players for website OR a single player for Discord Bot (with N/A fallbacks)
app.get('/api/players', async (req, res) => {
    try {
        const playerName = req.query.name;

        // If Discord requests a specific player (?name=...), return a SINGLE object with N/A fallbacks
        if (playerName) {
            let playerDoc = await Player.findOne({ name: new RegExp(`^${playerName}$`, 'i') });
            if (!playerDoc) {
                return res.status(404).json({ error: "Player not found" });
            }

            // Convert Mongoose document to a clean plain JavaScript object
            let player = playerDoc.toObject();

            // Explicitly define all 9 gamemodes so none of them can ever be missing
            const standardModes = ['npot', 'sword', 'axe', 'smp', 'cpvp', 'spearmace', 'pot', 'uhc', 'mace'];
            let tiersObj = {};

            standardModes.forEach(gm => {
                let val = null;
                if (playerDoc.tiers) {
                    if (typeof playerDoc.tiers.get === 'function') {
                        val = playerDoc.tiers.get(gm);
                    } else {
                        val = playerDoc.tiers[gm];
                    }
                }
                tiersObj[gm] = (val && val !== 'None' && val !== 'N/A' && val !== '') ? val : "N/A";
            });

            player.tiers = tiersObj;
            return res.json(player);
        }

        // Otherwise, return all players in an array [...] for your website leaderboard
        const players = await Player.find({});
        res.json(players);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch players" });
    }
});

// 2. POST API - Sync tier result posted from Discord Bot
app.post('/api/update-tier', async (req, res) => {
    const name = req.body.name || req.body.ign;
    const uuid = req.body.uuid;
    const region = req.body.region;
    const gamemode = req.body.gamemode;
    const newTier = req.body.newTier || req.body.new_tier;

    const clientSecret = req.headers['x-bot-secret'] || req.headers['x-api-key'] || req.body.apiKey || req.body.secret || req.body.bot_secret;
    const validSecret = process.env.BOT_SECRET_KEY || process.env.BOT_SECRET;

    if (!clientSecret || clientSecret !== validSecret) {
        return res.status(403).json({ error: "Unauthorized request" });
    }
    if (!name || !gamemode || !newTier) {
        return res.status(400).json({ error: "Missing required fields (name/ign, gamemode, newTier/new_tier)" });
    }

    try {
        let player = await Player.findOne({ name: new RegExp(`^${name}$`, 'i') });

        if (!player) {
            player = new Player({
                name: name,
                uuid: uuid || "",
                region: region || "NA",
                tiers: {}
            });
        }

        if (region) player.region = region;
        if (uuid) player.uuid = uuid;

        let gmKey = gamemode.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (gmKey === 'nethpot' || gmKey === 'netheritepot') gmKey = 'npot';
        
        player.tiers.set(gmKey, newTier.toUpperCase());
        await player.save();

        res.json({ message: `Successfully updated ${name}'s ${gmKey} tier to ${newTier}`, player });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error updating player tier" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`ApexTiers API server running on port ${PORT}`);
});
