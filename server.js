const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// List of players hidden from tierlist until retested (case-insensitive)
const EXCLUDED_PLAYERS = [
    'enderboygamerz',
    'flewtop',
    'klyro_gamer',
    'iamshiviii',
    'bluxxyblux9',
    'haryana_boy',
    'trxxd_op',
    'savvywtf_'
];

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

// Helper Function: Calculates Overall Tier based on player's active tiers
function calculateOverallTier(tiers) {
    const tierPoints = {
        'HT1': 10, 'LT1': 9,
        'HT2': 8,  'LT2': 7,
        'HT3': 6,  'LT3': 5,
        'HT4': 4,  'LT4': 3,
        'HT5': 2,  'LT5': 1,
        'T1': 10,  'T2': 8,  'T3': 6,  'T4': 4,  'T5': 2
    };

    let totalScore = 0;
    let count = 0;

    for (const gm in tiers) {
        const tierVal = tiers[gm] ? tiers[gm].toUpperCase() : 'N/A';
        if (tierPoints[tierVal] !== undefined) {
            totalScore += tierPoints[tierVal];
            count++;
        }
    }

    if (count === 0 || totalScore === 0) return 'Unranked';

    const avg = totalScore / count;

    if (avg >= 9.5) return 'HT1';
    if (avg >= 8.5) return 'LT1';
    if (avg >= 7.5) return 'HT2';
    if (avg >= 6.5) return 'LT2';
    if (avg >= 5.5) return 'HT3';
    if (avg >= 4.5) return 'LT3';
    if (avg >= 3.5) return 'HT4';
    if (avg >= 2.5) return 'LT4';
    if (avg >= 1.5) return 'HT5';
    return 'LT5';
}

const standardModes = ['npot', 'sword', 'axe', 'smp', 'cpvp', 'spearmace', 'pot', 'uhc', 'mace'];

// Helper to sanitize tier object keys and map gamemode aliases
function mapPlayerTiers(rawTiers) {
    let tiersObj = {};
    standardModes.forEach(gm => {
        let val = rawTiers[gm];
        if (!val && gm === 'npot') {
            val = rawTiers['nethpot'] || rawTiers['netheritepot'];
        }
        if (!val && gm === 'cpvp') {
            val = rawTiers['crystalvanilla'] || rawTiers['crystal'] || rawTiers['vanilla'] || rawTiers['cvp'];
        }
        tiersObj[gm] = (val && val !== 'None' && val !== 'N/A' && val !== '') ? val : "N/A";
    });
    return tiersObj;
}

// 1. GET API - Fetch single player or all players
app.get('/api/players', async (req, res) => {
    try {
        const playerName = req.query.name || req.query.ign || req.query.player;

        if (playerName) {
            // Check if requested player is pending retest
            if (EXCLUDED_PLAYERS.includes(playerName.toLowerCase())) {
                return res.status(404).json({ error: "Player pending retest" });
            }

            let playerDoc = await Player.findOne({ name: new RegExp(`^${playerName}$`, 'i') });
            if (!playerDoc) {
                return res.status(404).json({ error: "Player not found" });
            }

            let player = playerDoc.toObject();

            // Convert DB tier keys to lowercase & clean special chars
            let rawTiers = {};
            if (playerDoc.tiers) {
                if (typeof playerDoc.tiers.forEach === 'function') {
                    playerDoc.tiers.forEach((value, key) => {
                        rawTiers[key.toLowerCase().replace(/[^a-z0-9]/g, '')] = value;
                    });
                } else {
                    Object.keys(playerDoc.tiers).forEach(key => {
                        rawTiers[key.toLowerCase().replace(/[^a-z0-9]/g, '')] = playerDoc.tiers[key];
                    });
                }
            }

            let tiersObj = mapPlayerTiers(rawTiers);
            player.tiers = tiersObj;
            player.overall = calculateOverallTier(tiersObj);
            return res.json(player);
        }

        // Return all players for website (excluding players pending retest)
        const players = await Player.find({});
        const updatedPlayers = players
            .filter(p => p.name && !EXCLUDED_PLAYERS.includes(p.name.toLowerCase()))
            .map(p => {
                let obj = p.toObject();
                let rawTiers = {};
                if (p.tiers) {
                    if (typeof p.tiers.forEach === 'function') {
                        p.tiers.forEach((value, key) => {
                            rawTiers[key.toLowerCase().replace(/[^a-z0-9]/g, '')] = value;
                        });
                    } else {
                        Object.keys(p.tiers).forEach(key => {
                            rawTiers[key.toLowerCase().replace(/[^a-z0-9]/g, '')] = p.tiers[key];
                        });
                    }
                }
                let tiersObj = mapPlayerTiers(rawTiers);
                obj.tiers = tiersObj;
                obj.overall = calculateOverallTier(tiersObj);
                return obj;
            });

        res.json(updatedPlayers);
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

        // Clean key & map gamemode aliases
        let gmKey = gamemode.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (gmKey === 'nethpot' || gmKey === 'netheritepot') gmKey = 'npot';
        if (gmKey === 'crystalvanilla' || gmKey === 'crystal' || gmKey === 'vanilla' || gmKey === 'cvp') gmKey = 'cpvp';

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
