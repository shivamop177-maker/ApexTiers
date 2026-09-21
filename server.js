// 1. GET API - Fetch all players for website OR a single player for Discord Bot
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
                    // Handle Mongoose Map lookup safely
                    if (typeof playerDoc.tiers.get === 'function') {
                        val = playerDoc.tiers.get(gm);
                    } else {
                        val = playerDoc.tiers[gm];
                    }
                }
                // If it exists and isn't empty, use it. Otherwise, fallback cleanly to "N/A"
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
