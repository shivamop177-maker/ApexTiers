// 1. GET API - Fetch single player (case-insensitive tier key handling)
app.get('/api/players', async (req, res) => {
    try {
        const playerName = req.query.name || req.query.ign || req.query.player;

        if (playerName) {
            let playerDoc = await Player.findOne({ name: new RegExp(`^${playerName}$`, 'i') });
            if (!playerDoc) {
                return res.status(404).json({ error: "Player not found" });
            }

            let player = playerDoc.toObject();

            // 1. Convert all DB tier keys to lowercase so case doesn't break lookup
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

            // 2. Map standard modes with alias fallbacks
            let tiersObj = {};
            standardModes.forEach(gm => {
                let val = rawTiers[gm];
                if (!val && gm === 'npot') {
                    val = rawTiers['nethpot'] || rawTiers['netheritepot'];
                }
                tiersObj[gm] = (val && val !== 'None' && val !== 'N/A' && val !== '') ? val : "N/A";
            });

            player.tiers = tiersObj;
            player.overall = calculateOverallTier(tiersObj);
            return res.json(player);
        }

        // Return all players for web
        const players = await Player.find({});
        res.json(players);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch players" });
    }
});
