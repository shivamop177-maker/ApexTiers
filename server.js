// 1. GET API - Fetch all players for website OR a single player for Discord Bot
app.get('/api/players', async (req, res) => {
    try {
        const playerName = req.query.name;

        // If Discord requests a specific player (?name=...), return a SINGLE object with N/A fallbacks
        if (playerName) {
            let player = await Player.findOne({ name: new RegExp(`^${playerName}$`, 'i') }).lean();
            if (!player) {
                return res.status(404).json({ error: "Player not found" });
            }

            // Ensure all 9 gamemodes plus crystalvanilla always exist (defaulting to "N/A")
            const standardModes = ['npot', 'sword', 'axe', 'smp', 'cpvp', 'spearmace', 'pot', 'uhc', 'mace', 'crystalvanilla'];
            let tiersObj = {};
            
            standardModes.forEach(gm => {
                let val = null;
                if (player.tiers instanceof Map || (player.tiers && typeof player.tiers.get === 'function')) {
                    val = player.tiers.get(gm);
                } else if (player.tiers) {
                    val = player.tiers[gm];
                }
                tiersObj[gm] = (val && val !== 'None' && val !== 'N/A') ? val : "N/A";
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
