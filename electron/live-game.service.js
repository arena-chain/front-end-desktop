'use strict';

/**
 * League Live Client → NestJS relay.
 * Polls https://127.0.0.1:2999/liveclientdata/allgamedata every 2s while
 * the LoL gameflow phase is "InProgress", reduces the payload, and POSTs
 * it to NestJS at /api/live-game/update.
 *
 * Started/stopped by the LCU phase watcher in main.js.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

let NEST_BASE = process.env.LIVE_GAME_NEST_URL || null;

function _readArenaApiJson() {
    try {
        const candidates = [
            path.join(__dirname, '..', 'arena-api.json'),
            path.join(process.cwd(), 'arena-api.json'),
        ];
        for (const p of candidates) {
            if (!fs.existsSync(p)) continue;
            const j = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (j && typeof j.apiOrigin === 'string' && j.apiOrigin) {
                return j.apiOrigin.replace(/\/+$/, '');
            }
        }
    } catch (_) {
        /* ignore */
    }
    return null;
}

function _resolveNestBase() {
    if (NEST_BASE) return NEST_BASE;
    const fromFile = _readArenaApiJson();
    if (fromFile) return fromFile;
    return 'http://127.0.0.1:3000';
}

function setNestBaseUrl(url) {
    if (typeof url === 'string' && url) {
        NEST_BASE = url.replace(/\/+$/, '');
        console.log(`[LiveGame] NEST_BASE set to ${NEST_BASE}`);
    }
}

const liveClientHttpsAgent = new https.Agent({ rejectUnauthorized: false });

let liveGameInterval = null;
const lastKnownEvents = new Set();
let isPolling = false;
let hadSuccessfulFetch = false;
let bootstrapEvents = true;
let consecutiveFailures = 0;

const MAX_CONSECUTIVE_FAILURES = 5;
const POLL_INTERVAL_MS = 2000;

function eventId(ev) {
    if (ev == null || typeof ev !== 'object') return null;
    const id = ev.EventID ?? ev.EventId;
    if (id === undefined || id === null) return null;
    return id;
}

function postJson(pathSuffix, bodyObj) {
    return new Promise((resolve, reject) => {
        let u;
        try {
            const base = _resolveNestBase();
            u = new URL(pathSuffix.startsWith('http') ? pathSuffix : `${base}${pathSuffix}`);
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
        req.setTimeout(5000, () => req.destroy(new Error('Nest POST timeout')));
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
        req.setTimeout(8000, () => req.destroy(new Error('Live Client timeout')));
        req.end();
    });
}

async function pollTick() {
    if (!isPolling) return;
    try {
        const allGameData = await fetchAllGameData();
        consecutiveFailures = 0;
        hadSuccessfulFetch = true;

        const activePlayer = allGameData.activePlayer || {};
        const gameData = allGameData.gameData;
        const allPlayers = Array.isArray(allGameData.allPlayers) ? allGameData.allPlayers : [];
        const localName =
            activePlayer && activePlayer.summonerName != null
                ? String(activePlayer.summonerName)
                : '';
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
                isDead: p.isDead ?? false,
                respawnTimer: p.respawnTimer ?? 0,
                items: Array.isArray(p.items)
                    ? p.items.map((item) => ({
                          itemID: item.itemID ?? item.id ?? 0,
                          displayName: item.displayName ?? item.name ?? '',
                          price: item.price ?? 0,
                          slot: item.slot ?? 0,
                      }))
                    : [],
            }));

        const orderTeam = teamSummary(orderTeamPlayers);
        const chaosTeam = teamSummary(chaosTeamPlayers);

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
    } catch (err) {
        consecutiveFailures += 1;
        console.warn(
            `[LiveGame] pollTick failure ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}: ${err.message}`,
        );
        if (isPolling && hadSuccessfulFetch && consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            console.warn('[LiveGame] Giving up after consecutive failures — broadcasting ended.');
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
    consecutiveFailures = 0;
    console.log(`[LiveGame] Polling started (NEST_BASE=${_resolveNestBase()})`);
    void pollTick();
    liveGameInterval = setInterval(() => void pollTick(), POLL_INTERVAL_MS);
}

function stopLiveGamePolling() {
    if (liveGameInterval != null) {
        clearInterval(liveGameInterval);
        liveGameInterval = null;
    }
    if (isPolling) console.log('[LiveGame] Polling stopped');
    isPolling = false;
    lastKnownEvents.clear();
    hadSuccessfulFetch = false;
    bootstrapEvents = true;
    consecutiveFailures = 0;
}

function isPollingActive() {
    return isPolling;
}

/**
 * Direct phase notification to NestJS so the gateway broadcasts
 * `game-started` / `game-ended` immediately without waiting for the next
 * poll tick. Called by the LCU phase watcher in main.js.
 */
async function postPhase(phase) {
    const p = String(phase || '').trim();
    if (!p) return;
    try {
        await postJson('/api/live-game/phase', { phase: p });
    } catch (e) {
        console.warn(`[LiveGame] postPhase(${p}) failed: ${e.message}`);
    }
}

function registerLiveGameIpc(ipcMain) {
    ipcMain.on('start-live-polling', () => {
        startLiveGamePolling();
    });
    ipcMain.on('stop-live-polling', () => {
        stopLiveGamePolling();
    });
    ipcMain.handle('live-polling-status', () => isPollingActive());
}

module.exports = {
    startLiveGamePolling,
    stopLiveGamePolling,
    isPollingActive,
    registerLiveGameIpc,
    setNestBaseUrl,
    postPhase,
};
