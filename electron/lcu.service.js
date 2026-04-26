const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * LcuService handles connection to the League Client Update (LCU) API.
 * It reads the lockfile for credentials and provides methods for lobby automation.
 */
class LcuService {
    constructor() {
        this.api = null;
        this.credentials = null;
    }

    /**
     * Attempts to find the League of Legends lockfile and extract credentials.
     * @returns {Promise<boolean>}
     */
    async connect() {
        try {
            const lockfilePath = this.findLockfile();
            if (!lockfilePath) {
                console.warn('[LCU] Lockfile not found or inaccessible. Ensure League of Legends is running.');
                return false;
            }

            const content = fs.readFileSync(lockfilePath, 'utf8');
            const [name, pid, port, password, protocol] = content.split(':');
            
            this.credentials = { port, password, protocol };
            
            this.api = axios.create({
                baseURL: `${protocol}://127.0.0.1:${port}`,
                auth: {
                    username: 'riot',
                    password: password
                },
                httpsAgent: new https.Agent({
                    rejectUnauthorized: false // LCU uses self-signed certificates
                }),
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            // Fast health check with 5s timeout - Using current-summoner as it is more reliable
            await this.api.get('/lol-summoner/v1/current-summoner', { timeout: 5000 });
            console.log(`[LCU] Connected to League Client on port ${port}`);
            return true;
        } catch (error) {
            console.error('[LCU] Connection failed during health check:', error.message);
            if (error.response) {
                console.error('[LCU] Response data:', error.response.data);
                console.error('[LCU] Response status:', error.response.status);
            }
            this.api = null;
            return false;
        }
    }

    /**
     * Resolves the lockfile path by first checking running processes, 
     * then falling back to common installation directories.
     */
    findLockfile() {
        try {
            // Task 1: Try to find the path via running processes (most reliable)
            const output = execSync('wmic process where "name=\'LeagueClient.exe\'" get ExecutablePath', { encoding: 'utf8' });
            const lines = output.split('\n').map(l => l.trim()).filter(l => l && l !== 'ExecutablePath');
            
            if (lines.length > 0) {
                const gamePath = path.dirname(lines[0]);
                const lockfile = path.join(gamePath, 'lockfile');
                if (fs.existsSync(lockfile)) {
                    console.log(`[LCU] Found lockfile via process: ${lockfile}`);
                    return lockfile;
                }
            }
        } catch (e) {
            // console.warn('[LCU] Process check failed, falling back to disk search.');
        }

        const possiblePaths = [
            'C:\\Riot Games\\League of Legends\\lockfile',
            path.join(process.env.LOCALAPPDATA || '', 'Riot Games', 'League of Legends', 'lockfile'),
            path.join(process.env.APPDATA || '', 'Riot Games', 'League of Legends', 'lockfile'),
            'C:\\Garena\\Games\\32771\\League of Legends\\lockfile',
            'D:\\Riot Games\\League of Legends\\lockfile',
        ];

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                console.log(`[LCU] Found lockfile via path search: ${p}`);
                return p;
            }
        }
        return null;
    }

    /**
     * Deep cleans the current client state to prepare for a fresh lobby.
     */
    async leaveCurrentLobby() {
        if (!this.api) return;
        try {
            console.log('[LCU] Deep cleaning lobby/matchmaking state...');
            await this.api.post('/lol-lobby/v2/matchmaking/leave').catch(() => {});
            await this.api.delete('/lol-lobby/v2/lobby').catch(() => {});
            await new Promise(r => setTimeout(r, 800));
        } catch (e) {
            console.warn('[LCU] Cleanup warning:', e.message);
        }
    }

    /**
     * Logs current client state for debugging.
     */
    async debugLobbyState() {
        if (!this.api) return;
        try {
            const phase = await this.api.get('/lol-gameflow/v1/gameflow-phase');
            console.log('[LCU Debug] Current Gameflow Phase:', phase.data);
            
            const lobby = await this.api.get('/lol-lobby/v2/lobby').catch(() => ({ data: 'None' }));
            console.log('[LCU Debug] Current Lobby Data:', JSON.stringify(lobby.data, null, 2));
        } catch (e) {
            console.error('[LCU Debug] Failed to gather state:', e.message);
        }
    }

    /**
     * Creates a custom game lobby using a high-compatibility strategy.
     */
    async createCustomLobby(mode) {
        if (!this.api) throw new Error("Not connected to LCU");

        try {
            await this.debugLobbyState();
            await this.leaveCurrentLobby();

            // Specialized Strategy: Matches the User's Screenshot Exactly
            const strategies = [
                // Style 1: Screenshot Match (Howling Abyss, TeamSize 1, No Delay)
                {
                    customGameLobby: {
                        configuration: {
                            gameMode: "CLASSIC",
                            gameTypeConfigId: 1, 
                            mapId: 12,           
                            teamSize: 1,         
                            spectatorPolicy: "AllAllowed",
                            spectatorDelay: "NONE"
                        },
                        lobbyName: `ArenaChain Match`,
                        lobbyPassword: ""
                    },
                    isCustom: true
                },
                // Style 2: Standard Summoner's Rift Variation of Screenshot
                {
                    customGameLobby: {
                        configuration: {
                            gameMode: "CLASSIC",
                            gameTypeConfigId: 1,
                            mapId: 11,
                            teamSize: 1,
                            spectatorPolicy: "AllAllowed"
                        },
                        lobbyName: `ArenaChain Match`,
                        lobbyPassword: ""
                    },
                    isCustom: true
                }
            ];

            let lastError = null;
            for (let i = 0; i < strategies.length; i++) {
                try {
                    console.log(`[LCU] Attempting Screenshot-Matched Strategy ${i + 1}...`);
                    const response = await this.api.post('/lol-lobby/v2/lobby', strategies[i]);
                    console.log(`[LCU] Strategy ${i + 1} SUCCEEDED!`);
                    return response.data;
                } catch (err) {
                    lastError = err.response?.data || { message: err.message };
                    console.warn(`[LCU] Strategy ${i + 1} rejected:`, lastError.message || lastError);
                }
            }

            throw new Error(lastError?.message || "Lobby creation failed. Ensure you are not in a group or queue.");
        } catch (error) {
            console.error('[LCU] Critical failure during specialized lobby creation:', error.message);
            throw error;
        }
    }

    /**
     * Invites players and verifies friend status.
     * @param {string[]} names 
     */
    async invitePlayers(names) {
        if (!this.api) throw new Error("Not connected to LCU");
        
        const results = { successful: [], failed: [] };

        // Diagnostic: List friends
        try {
            const friends = await this.api.get('/lol-chat/v1/friends');
            const friendNames = friends.data.map(f => f.name.toLowerCase());
            console.log('[LCU] Friend check initialized.');
            
            for (const name of names) {
                if (!friendNames.includes(name.split('#')[0].toLowerCase())) {
                    console.warn(`[LCU] WARNING: ${name} is NOT on your friend list. Invitation may fail.`);
                }
            }
        } catch (e) {
            console.warn('[LCU] Friend list check unavailable.');
        }

        for (const name of names) {
            try {
                const search = await this.api.get(`/lol-summoner/v1/summoners?name=${encodeURIComponent(name)}`);
                const summonerId = search.data.summonerId;

                await this.api.post('/lol-lobby/v2/lobby/invitations', [{ toSummonerId: summonerId }]);
                results.successful.push(name);
            } catch (error) {
                try {
                    await this.api.post('/lol-lobby/v2/lobby/invitations', [{ toSummonerName: name }]);
                    results.successful.push(name);
                } catch (e) {
                    console.error(`[LCU] Invite failed for ${name}:`, e.message);
                    results.failed.push(name);
                }
            }
        }
        return results;
    }
}

module.exports = { LcuService };
