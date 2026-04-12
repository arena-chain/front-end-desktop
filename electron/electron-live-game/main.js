/**
 * League Live Client (HTTPS :2999, self-signed) → NestJS live-game API.
 *
 * Nest default: PORT from env or 3000 (see backend-nest1/src/main.ts).
 * Override base URL: LIVE_GAME_NEST_URL=http://127.0.0.1:3000
 *
 * IPC (register via registerLiveGameIpc):
 *   start-live-polling / stop-live-polling
 */
'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

const NEST_BASE = process.env.LIVE_GAME_NEST_URL || 'http://127.0.0.1:3000';

/** League Live Client API uses a self-signed cert on 2999. */
const liveClientHttpsAgent = new https.Agent({ rejectUnauthorized: false });

let liveGameInterval = null;
/** @type {Set<number|string>} */
const lastKnownEvents = new Set();
let isPolling = false;
let hadSuccessfulFetch = false;
let bootstrapEvents = true;

function eventId(ev) {
    if (ev == null || typeof ev !== 'object') return null;
    const id = ev.EventID ?? ev.EventId;
    if (id === undefined || id === null) return null;
    return id;
}

function stopLiveGamePolling() {
    if (liveGameInterval != null) {
        clearInterval(liveGameInterval);
        liveGameInterval = null;
    }
    isPolling = false;
    lastKnownEvents.clear();
    hadSuccessfulFetch = false;
    bootstrapEvents = true;
}

function postJson(pathSuffix, bodyObj) {
    return new Promise((resolve, reject) => {
        let u;
        try {
            u = new URL(pathSuffix.startsWith('http') ? pathSuffix : `${NEST_BASE}${pathSuffix}`);
        } catch (e) {
            reject(e);
            return;
        }
        const isHttps = u.protocol === 'https:';
        const lib = isHttps ? https : http;
        const data = JSON.stringify(bodyObj);
        const opts = {
            hostname: u.hostname,
            port: u.port || (isHttps ? 443 : 80),
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
            },
        };
        const req = lib.request(opts, (res) => {
            res.resume();
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                resolve();
            } else {
                reject(new Error(`POST ${pathSuffix} status ${res.statusCode}`));
            }
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function fetchAllGameData() {
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: '127.0.0.1',
            port: 2999,
            path: '/liveclientdata/allgamedata',
            method: 'GET',
            agent: liveClientHttpsAgent,
        };
        const req = https.request(opts, (res) => {
            let raw = '';
            res.on('data', (c) => {
                raw += c;
            });
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Live Client HTTP ${res.statusCode}`));
                    return;
                }
                try {
                    resolve(JSON.parse(raw));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(8000, () => {
            req.destroy(new Error('Live Client timeout'));
        });
        req.end();
    });
}

async function pollTick() {
    if (!isPolling) return;
    try {
        const allGameData = await fetchAllGameData();
        hadSuccessfulFetch = true;

        const activePlayer = allGameData.activePlayer || {};
        const gameData = allGameData.gameData;
        const allPlayers = Array.isArray(allGameData.allPlayers) ? allGameData.allPlayers : [];
        const localName =
            activePlayer && activePlayer.summonerName != null ? String(activePlayer.summonerName) : '';
        const localPlayerData =
            allPlayers.find((p) => p && p.summonerName === localName) || allPlayers[0] || {};

        const orderTeamPlayers = allPlayers.filter((p) => p && p.team === 'ORDER');
        const chaosTeamPlayers = allPlayers.filter((p) => p && p.team === 'CHAOS');

        const teamSummary = (teamPlayers) =>
            teamPlayers.map((p) => ({
                summonerName: p.summonerName,
                championName: p.championName,
                kills: p.scores?.kills ?? 0,
                deaths: p.scores?.deaths ?? 0,
                assists: p.scores?.assists ?? 0,
                creepScore: p.scores?.creepScore ?? 0,
                team: p.team,
                position: p.position ?? '',
                isLocalPlayer: p.summonerName === localName,
            }));

        const orderTeam = teamSummary(orderTeamPlayers);
        const chaosTeam = teamSummary(chaosTeamPlayers);

        console.log('[LiveGame] localPlayerData scores:', JSON.stringify(localPlayerData?.scores));
        console.log('[LiveGame] activePlayer gold:', activePlayer?.currentGold);

        const events = allGameData?.events?.Events;
        const list = Array.isArray(events) ? events : [];

        let newEvents = [];
        if (bootstrapEvents) {
            for (const e of list) {
                const id = eventId(e);
                if (id != null) lastKnownEvents.add(id);
            }
            bootstrapEvents = false;
            newEvents = [];
        } else {
            for (const e of list) {
                const id = eventId(e);
                if (id == null) continue;
                if (!lastKnownEvents.has(id)) {
                    newEvents.push(e);
                    lastKnownEvents.add(id);
                }
            }
        }

        await postJson('/api/live-game/update', {
            activePlayer,
            localPlayerData,
            gameData,
            localPlayerName: localName,
            newEvents,
            orderTeam,
            chaosTeam,
        });
    } catch (_err) {
        if (isPolling && hadSuccessfulFetch) {
            try {
                await postJson('/api/live-game/ended', {});
            } catch (_) {
                /* ignore */
            }
            stopLiveGamePolling();
        }
    }
}

function startLiveGamePolling() {
    if (isPolling) return;
    isPolling = true;
    lastKnownEvents.clear();
    hadSuccessfulFetch = false;
    bootstrapEvents = true;
    void pollTick();
    liveGameInterval = setInterval(() => void pollTick(), 2000);
}

/**
 * @param {import('electron').IpcMain} ipcMain
 */
function registerLiveGameIpc(ipcMain) {
    ipcMain.on('start-live-polling', () => {
        startLiveGamePolling();
    });
    ipcMain.on('stop-live-polling', () => {
        stopLiveGamePolling();
    });
}

module.exports = {
    startLiveGamePolling,
    stopLiveGamePolling,
    registerLiveGameIpc,
};
