const { ipcRenderer } = require('electron');
const { requireAuth, getUser } = require('../../../shared/api');
const {
    BASE_URL,
    getMyChannel,
    createChannel,
    updateChannel,
    getMyStreams,
    createStream,
    updateStream,
    startStream,
    endStream,
    getChannelMessages,
    createLiveSocket,
    getIceServers,
    buildChannelPayload,
} = require('../../../shared/creator');

if (!requireAuth()) {
    throw new Error('Not authenticated');
}

function navigateBackToChannel() {
    try {
        ipcRenderer.send('navigate-to', 'player-channel');
    } catch { }

    setTimeout(() => {
        window.location.href = '../channel/channel_dashboard.html';
    }, 80);
}

const SESSION_KEY = 'arena_stream_session';
const DRAFT_KEY = 'arena_channel_draft';
const user = getUser();
const state = {
    isLive: false,
    viewers: 0,
    bitrate: 6000,
    droppedFrames: 0,
    startedAt: null,
    statsIntervalId: null,
    clockIntervalId: null,
    liveSocket: null,
    channel: null,
    currentStream: null,
    messageCount: 0,
    broadcastMode: null,
    localStream: null,
    previewStream: null,
    sourceStreams: [],
    compositeCanvas: null,
    compositeFrameId: null,
    peerConnections: new Map(),
    pendingIceCandidates: new Map(),
    iceServers: [],
    selectedDesktopSourceId: null,
};

const session = (() => {
    try {
        return JSON.parse(localStorage.getItem(SESSION_KEY)) || {};
    } catch {
        return {};
    }
})();

const draft = (() => {
    try {
        return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {};
    } catch {
        return {};
    }
})();

const els = {
    title: document.getElementById('studio-title'),
    category: document.getElementById('studio-category'),
    channel: document.getElementById('studio-channel'),
    liveBadge: document.getElementById('studio-live-badge'),
    liveDuration: document.getElementById('live-duration'),
    goLive: document.getElementById('go-live-btn'),
    endLive: document.getElementById('end-live-btn'),
    copyShareLink: document.getElementById('copy-share-link'),
    health: document.getElementById('stream-health'),
    viewers: document.getElementById('viewer-count'),
    bitrate: document.getElementById('bitrate-count'),
    latency: document.getElementById('latency-count'),
    droppedFrames: document.getElementById('dropped-frames'),
    backToChannel: document.getElementById('back-to-channel'),
    notes: document.getElementById('producer-notes'),
    onAirPill: document.getElementById('on-air-pill'),
    programStatus: document.getElementById('program-status'),
    headline: document.getElementById('live-headline'),
    subheadline: document.getElementById('live-subheadline'),
    chatStatus: document.getElementById('chat-status'),
    chatMessages: document.getElementById('chat-messages'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    chatCount: document.getElementById('chat-count'),
    activityLog: document.getElementById('activity-log'),
    previewImage: document.getElementById('studio-preview-image'),
    previewVideo: document.getElementById('studio-video-preview'),
    liveOverlay: document.getElementById('live-overlay'),
    captureStatus: document.getElementById('capture-status'),
    sourceScreen: document.getElementById('source-screen'),
    sourceCamera: document.getElementById('source-camera'),
    sourceScreenCamera: document.getElementById('source-screen-camera'),
};

els.title.textContent = session.title || 'Untitled desktop live';
els.category.textContent = session.category || 'General';
els.channel.textContent = session.channelName || draft.channelName || 'Arena Creator Hub';

void getIceServers().then((servers) => {
    state.iceServers = servers;
    appendActivity('RTC config loaded.');
}).catch(() => {
    state.iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ];
});

function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function appendActivity(text, tone = 'neutral') {
    const row = document.createElement('div');
    const toneClass = tone === 'live' ? 'text-[#00ff87]' : tone === 'danger' ? 'text-[#ff4654]' : 'text-gray-300';
    row.className = 'rounded-2xl bg-white/5 border border-white/5 px-4 py-3';
    row.innerHTML = `
        <div class="flex items-start justify-between gap-3">
            <p class="text-sm ${toneClass}">${text}</p>
            <span class="text-[10px] text-gray-500">${new Date().toLocaleTimeString()}</span>
        </div>
    `;
    els.activityLog.prepend(row);
}

function appendChatMessage({ name, color, text, self = false, createdAt }) {
    const wrapper = document.createElement('div');
    wrapper.className = self ? 'ml-8' : '';
    wrapper.innerHTML = `
        <div class="rounded-2xl ${self ? 'bg-[#00ff87]/10 border border-[#00ff87]/20' : 'bg-white/5 border border-white/5'} px-4 py-3">
            <div class="flex items-center justify-between gap-3 mb-1">
                <span class="text-sm font-black" style="color:${self ? '#00ff87' : color || '#ffffff'}">${name}</span>
                <span class="text-[10px] text-gray-500">${new Date(createdAt || Date.now()).toLocaleTimeString()}</span>
            </div>
            <p class="text-sm ${self ? 'text-white' : 'text-gray-300'}">${text}</p>
        </div>
    `;
    els.chatMessages.appendChild(wrapper);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    state.messageCount += 1;
    els.chatCount.textContent = String(state.messageCount);
}

function clearChat() {
    els.chatMessages.innerHTML = '';
    state.messageCount = 0;
    els.chatCount.textContent = '0';
}

function setSourceButtons(mode) {
    [els.sourceScreen, els.sourceCamera, els.sourceScreenCamera].forEach((button) => button.classList.remove('active'));
    if (mode === 'screen') els.sourceScreen.classList.add('active');
    if (mode === 'camera') els.sourceCamera.classList.add('active');
    if (mode === 'screen-camera') els.sourceScreenCamera.classList.add('active');
}

async function attachPreview(stream) {
    state.previewStream = stream ? new MediaStream(stream.getVideoTracks()) : null;
    els.previewVideo.srcObject = state.previewStream;

    if (state.previewStream) {
        els.previewImage.classList.add('hidden');
        els.previewVideo.classList.remove('hidden');
        try { await els.previewVideo.play(); } catch { }
    } else {
        els.previewVideo.classList.add('hidden');
        els.previewImage.classList.remove('hidden');
        els.previewVideo.srcObject = null;
    }
}

function updateClock() {
    if (!state.startedAt) {
        els.liveDuration.textContent = '00:00:00';
        return;
    }
    els.liveDuration.textContent = formatDuration(Date.now() - state.startedAt);
}

function renderState() {
    if (state.isLive) {
        els.liveBadge.textContent = 'LIVE';
        els.liveBadge.className = 'px-3 py-1 rounded-full bg-[#ff4654] text-white text-[11px] font-black tracking-[0.2em]';
        els.health.textContent = state.localStream ? 'Broadcasting' : 'Standby';
        els.viewers.textContent = state.viewers.toLocaleString();
        els.bitrate.textContent = `${state.bitrate} kbps`;
        els.latency.textContent = '1.6 sec';
        els.droppedFrames.textContent = `${state.droppedFrames.toFixed(1)}%`;
        els.onAirPill.classList.remove('hidden');
        els.onAirPill.classList.add('flex');
        els.programStatus.textContent = state.broadcastMode ? `LIVE ${state.broadcastMode.toUpperCase()}` : 'LIVE OUTPUT ACTIVE';
        els.programStatus.className = 'px-3 py-1 rounded-full bg-[#ff4654]/20 border border-[#ff4654]/30 text-[#ff8c95] text-xs font-black tracking-[0.16em]';
        els.headline.textContent = state.localStream ? 'Live source is broadcasting from desktop studio' : 'Live stream created but no media source is active';
        els.subheadline.textContent = state.localStream
            ? 'Screen/camera/micro capture is active and being published to viewers.'
            : 'Select a capture source to start sending real video and audio.';
        els.chatStatus.textContent = 'Live chat is active. Messages from viewers will appear here.';
        els.previewImage.style.filter = 'saturate(1.15) contrast(1.05)';
        els.liveOverlay.className = 'absolute inset-0 bg-gradient-to-t from-[#0a0b0f] via-[#ff4654]/5 to-transparent';
    } else {
        els.liveBadge.textContent = 'OFFLINE';
        els.liveBadge.className = 'px-3 py-1 rounded-full bg-white/10 text-gray-300 text-[11px] font-black tracking-[0.2em]';
        els.health.textContent = 'Standby';
        els.viewers.textContent = '0';
        els.bitrate.textContent = `${state.bitrate} kbps`;
        els.latency.textContent = '0 sec';
        els.droppedFrames.textContent = '0.0%';
        els.onAirPill.classList.add('hidden');
        els.onAirPill.classList.remove('flex');
        els.programStatus.textContent = 'READY FOR LIVE CUT';
        els.programStatus.className = 'px-3 py-1 rounded-full bg-[#00ff87]/15 border border-[#00ff87]/30 text-[#00ff87] text-xs font-black tracking-[0.16em]';
        els.headline.textContent = 'Studio standing by for launch';
        els.subheadline.textContent = 'Choose a source, then Go Live to start a real desktop broadcast.';
        els.chatStatus.textContent = 'Chat is waiting for the live session to start.';
        els.previewImage.style.filter = 'grayscale(0.12)';
        els.liveOverlay.className = 'absolute inset-0 bg-gradient-to-t from-[#0a0b0f] via-[#0a0b0f]/10 to-transparent';
    }
    updateClock();
}

function stopCompositeRenderer() {
    if (state.compositeFrameId) {
        cancelAnimationFrame(state.compositeFrameId);
        state.compositeFrameId = null;
    }
    state.compositeCanvas = null;
}

function cleanupPeer(targetId) {
    const peer = state.peerConnections.get(targetId);
    if (peer) {
        peer.onicecandidate = null;
        peer.close();
        state.peerConnections.delete(targetId);
    }
    state.pendingIceCandidates.delete(targetId);
}

async function createScreenCameraBroadcastStream() {
    const screenStream = await createElectronScreenStream();
    const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

    const screenVideo = document.createElement('video');
    screenVideo.srcObject = screenStream;
    screenVideo.muted = true;
    screenVideo.playsInline = true;
    await screenVideo.play();

    const cameraVideo = document.createElement('video');
    cameraVideo.srcObject = cameraStream;
    cameraVideo.muted = true;
    cameraVideo.playsInline = true;
    await cameraVideo.play();

    const canvas = document.createElement('canvas');
    const width = screenVideo.videoWidth || 1280;
    const height = screenVideo.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;
    state.compositeCanvas = canvas;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create video compositor');

    const drawFrame = () => {
        context.clearRect(0, 0, width, height);
        context.drawImage(screenVideo, 0, 0, width, height);

        const overlayWidth = Math.max(width * 0.22, 220);
        const overlayHeight = overlayWidth * 0.5625;
        const margin = Math.max(width * 0.02, 18);
        const overlayX = width - overlayWidth - margin;
        const overlayY = height - overlayHeight - margin;

        context.fillStyle = 'rgba(0, 0, 0, 0.45)';
        context.fillRect(overlayX - 8, overlayY - 8, overlayWidth + 16, overlayHeight + 16);
        context.drawImage(cameraVideo, overlayX, overlayY, overlayWidth, overlayHeight);
        context.strokeStyle = '#39ff14';
        context.lineWidth = 3;
        context.strokeRect(overlayX, overlayY, overlayWidth, overlayHeight);

        state.compositeFrameId = requestAnimationFrame(drawFrame);
    };

    drawFrame();

    const composedStream = canvas.captureStream(30);
    [...screenStream.getAudioTracks(), ...cameraStream.getAudioTracks()].forEach((track) => {
        composedStream.addTrack(track);
    });

    state.sourceStreams = [screenStream, cameraStream];
    return composedStream;
}

async function createBroadcastStream(mode) {
    if (mode === 'screen') {
        const stream = await createElectronScreenStream();
        state.sourceStreams = [stream];
        return stream;
    }
    if (mode === 'camera') {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        state.sourceStreams = [stream];
        return stream;
    }
    return createScreenCameraBroadcastStream();
}

async function pickDesktopSource() {
    if (!ipcRenderer?.invoke) {
        throw new Error('Desktop source picker unavailable');
    }

    const sources = await ipcRenderer.invoke('desktop-sources');
    if (!sources || !sources.length) {
        throw new Error('No screen sources available');
    }

    const preferred = sources.find((source) => /^screen:/i.test(source.id))
        || sources.find((source) => /entire screen|screen/i.test(source.name))
        || sources[0];

    state.selectedDesktopSourceId = preferred.id;
    appendActivity(`Desktop source selected: ${preferred.name}.`);
    return preferred;
}

function getShareUrl() {
    const channelId = state.channel?._id || '';
    if (!channelId) return '';
    return `${BASE_URL}/watch/${channelId}`;
}

async function createElectronScreenStream() {
    const source = await pickDesktopSource();

    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Desktop capture is not supported in this renderer');
    }

    try {
        return await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: source.id,
                },
            },
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: source.id,
                    minWidth: 1280,
                    maxWidth: 3840,
                    minHeight: 720,
                    maxHeight: 2160,
                },
            },
        });
    } catch (error) {
        try {
            return await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: source.id,
                        minWidth: 1280,
                        maxWidth: 3840,
                        minHeight: 720,
                        maxHeight: 2160,
                    },
                },
            });
        } catch {
            throw error;
        }
    }
}

async function selectSource(mode) {
    try {
        await stopLocalMediaOnly();
        const stream = await createBroadcastStream(mode);
        state.localStream = stream;
        state.broadcastMode = mode;
        setSourceButtons(mode);
        els.captureStatus.textContent = `Selected source: ${mode}`;
        await attachPreview(stream);
        appendActivity(`Capture source ready: ${mode}.`, 'live');
        renderState();
    } catch (error) {
        els.captureStatus.textContent = error.message || 'Source capture failed';
        appendActivity(error.message || 'Source capture failed.', 'danger');
    }
}

function stopIntervals() {
    if (state.statsIntervalId) clearInterval(state.statsIntervalId);
    if (state.clockIntervalId) clearInterval(state.clockIntervalId);
    state.statsIntervalId = null;
    state.clockIntervalId = null;
}

async function stopLocalMediaOnly() {
    state.peerConnections.forEach((_, targetId) => cleanupPeer(targetId));
    if (state.localStream) {
        state.localStream.getTracks().forEach((track) => track.stop());
        state.localStream = null;
    }
    state.sourceStreams.forEach((stream) => {
        stream.getTracks().forEach((track) => track.stop());
    });
    state.sourceStreams = [];
    stopCompositeRenderer();
    state.broadcastMode = null;
    setSourceButtons(null);
    await attachPreview(null);
}

async function ensureChannel() {
    let channel = await getMyChannel();
    if (!channel) {
        channel = await createChannel(buildChannelPayload(draft));
        appendActivity('Channel created from desktop draft.', 'live');
    } else if (draft.channelName || draft.description || draft.tags || draft.category) {
        channel = await updateChannel(channel._id, buildChannelPayload(draft));
    }
    state.channel = channel;
    els.channel.textContent = channel.name || els.channel.textContent;
    return channel;
}

async function ensureStream(channel) {
    const streams = await getMyStreams().catch(() => []);
    const existing = streams.find((stream) => stream.isLive) || streams[0] || null;
    const payload = {
        channelId: channel._id,
        title: session.title || draft.title || 'Desktop live session',
        description: draft.description || 'Live session launched from desktop studio.',
        tags: [session.category, ...(session.tags || '').split(',')].map((item) => item && item.trim()).filter(Boolean),
    };

    let stream = existing
        ? await updateStream(existing._id, payload)
        : await createStream({ ...payload, isLive: false });

    if (!stream.isLive) {
        stream = await startStream(stream._id);
    }

    state.currentStream = stream;
    return stream;
}

async function connectLiveSocket(channelId) {
    if (state.liveSocket) return state.liveSocket;

    const socket = await createLiveSocket();
    state.liveSocket = socket;

    socket.on('connect', () => {
        appendActivity('Live socket connected.', 'live');
        socket.emit('join-channel', {
            channelId,
            role: 'broadcaster',
        });
    });

    socket.on('viewer-joined', async ({ viewerId, channelId: joinedChannelId }) => {
        if (!state.localStream || !state.channel || state.channel._id !== joinedChannelId) {
            return;
        }

        const peer = new RTCPeerConnection({ iceServers: state.iceServers.length ? state.iceServers : undefined });
        state.peerConnections.set(viewerId, peer);

        state.localStream.getTracks().forEach((track) => {
            peer.addTrack(track, state.localStream);
        });

        peer.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', {
                    targetId: viewerId,
                    channelId: joinedChannelId,
                    candidate: event.candidate.toJSON(),
                });
            }
        };

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit('signal-offer', {
            targetId: viewerId,
            channelId: joinedChannelId,
            description: offer,
        });
        appendActivity(`Viewer joined: ${viewerId.slice(0, 6)}...`, 'live');
    });

    socket.on('signal-answer', async ({ sourceId, description }) => {
        const peer = state.peerConnections.get(sourceId);
        if (!peer || !description) return;
        await peer.setRemoteDescription(new RTCSessionDescription(description));
        const pendingCandidates = state.pendingIceCandidates.get(sourceId) || [];
        for (const candidate of pendingCandidates) {
            await peer.addIceCandidate(new RTCIceCandidate(candidate));
        }
        state.pendingIceCandidates.delete(sourceId);
    });

    socket.on('ice-candidate', async ({ sourceId, candidate }) => {
        const peer = state.peerConnections.get(sourceId);
        if (!peer || !candidate) return;
        if (!peer.remoteDescription) {
            const pending = state.pendingIceCandidates.get(sourceId) || [];
            pending.push(candidate);
            state.pendingIceCandidates.set(sourceId, pending);
            return;
        }
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on('viewer-left', ({ viewerId }) => {
        cleanupPeer(viewerId);
    });

    socket.on('chat-message', (message) => {
        appendChatMessage({
            name: message.senderNickname || 'Viewer',
            color: message.senderRole === 'streamer' ? '#00ff87' : '#ffffff',
            text: message.message,
            createdAt: message.createdAt,
        });
    });

    socket.on('chat-error', ({ message }) => {
        appendActivity(message || 'Chat error.', 'danger');
    });

    socket.on('disconnect', () => {
        appendActivity('Live socket disconnected.', 'danger');
    });

    return socket;
}

async function loadExistingMessages(channelId) {
    const messages = await getChannelMessages(channelId, 50).catch(() => []);
    clearChat();
    messages.forEach((message) => {
        appendChatMessage({
            name: message.senderNickname || 'Viewer',
            color: message.senderRole === 'streamer' ? '#00ff87' : '#ffffff',
            text: message.message,
            createdAt: message.createdAt,
        });
    });
}

async function startLive() {
    if (state.isLive) return;
    if (!state.localStream) {
        appendActivity('Select Screen, Camera + Mic, or Screen + Camera before going live.', 'danger');
        els.captureStatus.textContent = 'Choose a real capture source first.';
        return;
    }

    try {
        const channel = await ensureChannel();
        const stream = await ensureStream(channel);
        await connectLiveSocket(channel._id);
        await loadExistingMessages(channel._id);

        state.isLive = true;
        state.startedAt = stream.startedAt ? new Date(stream.startedAt).getTime() : Date.now();
        state.viewers = stream.viewerCount || 1;
        state.bitrate = 5960;
        state.droppedFrames = 0.2;
        els.notes.value = `Live session connected to backend stream + chat using ${state.broadcastMode}.`;
        appendActivity('Live session started successfully.', 'live');
        appendActivity(`Backend stream "${stream.title}" is now on air.`, 'live');
        appendActivity(`Share link ready: ${getShareUrl()}`, 'live');

        state.statsIntervalId = setInterval(() => {
            if (!state.isLive) return;
            state.viewers = Math.max(1, state.viewers + Math.floor(Math.random() * 10) - 2);
            state.bitrate = 5850 + Math.floor(Math.random() * 280);
            state.droppedFrames = Math.max(0, Math.min(1.2, state.droppedFrames + ((Math.random() * 0.3) - 0.15)));
            renderState();
        }, 3500);

        state.clockIntervalId = setInterval(() => {
            if (!state.isLive) return;
            updateClock();
        }, 1000);

        renderState();
    } catch (error) {
        appendActivity(error.message || 'Unable to start live session.', 'danger');
    }
}

async function stopLive() {
    if (!state.isLive && !state.localStream) return;

    try {
        if (state.currentStream?._id && state.isLive) {
            await endStream(state.currentStream._id);
        }
        if (state.liveSocket) {
            state.liveSocket.emit('leave-channel');
            state.liveSocket.disconnect();
            state.liveSocket = null;
        }
        state.isLive = false;
        appendActivity('Live session ended.', 'danger');
        stopIntervals();
        state.startedAt = null;
        await stopLocalMediaOnly();
        els.captureStatus.textContent = 'Capture stopped.';
        renderState();
    } catch (error) {
        appendActivity(error.message || 'Unable to end live session.', 'danger');
    }
}

els.sourceScreen.addEventListener('click', () => { void selectSource('screen'); });
els.sourceCamera.addEventListener('click', () => { void selectSource('camera'); });
els.sourceScreenCamera.addEventListener('click', () => { void selectSource('screen-camera'); });
els.goLive.addEventListener('click', () => { void startLive(); });
els.endLive.addEventListener('click', () => { void stopLive(); });
els.backToChannel.addEventListener('click', () => { navigateBackToChannel(); });
els.copyShareLink.addEventListener('click', async () => {
    const url = getShareUrl();
    if (!url) {
        appendActivity('Start or sync a channel first to get the share link.', 'danger');
        return;
    }
    try {
        await navigator.clipboard.writeText(url);
        appendActivity(`Share link copied: ${url}`, 'live');
    } catch {
        appendActivity(`Share link: ${url}`, 'live');
    }
});

els.chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = els.chatInput.value.trim();
    if (!text) return;

    if (state.liveSocket && state.channel?._id) {
        state.liveSocket.emit('chat-message', {
            channelId: state.channel._id,
            message: text,
        });
    }

    appendChatMessage({
        name: user?.nickname || 'You',
        color: '#00ff87',
        text,
        self: true,
    });
    els.chatInput.value = '';
});

window.addEventListener('beforeunload', () => {
    void stopLive();
});

appendActivity('Studio loaded and waiting for launch.');
renderState();
