'use strict';

const { apiRequest, BASE_URL } = require('../../../shared/api');

let chart;
let candlestickSeries;
let currentAssetId = null;
let socket = null;

let currentSide = 'BUY';

async function init() {
    lucide.createIcons();
    await loadAssets();
    initChart();
    setupOrderEntry();
    
    // Connect to WebSocket (Global 'io' from CDN)
    const socketUrl = BASE_URL.replace('/api', ''); 
    if (typeof io !== 'undefined') {
        socket = io(`${socketUrl}/trading`, { transports: ['websocket'] });

        socket.on('connect', () => {
            console.log('Connected to Trading WebSocket');
            if (currentAssetId) subscribeToAsset(currentAssetId);
        });

        socket.on('newTrade', (trade) => {
            if (trade.assetId === currentAssetId) {
                addTradeToList(trade);
                updateTicker(trade.price);
                updateChartWithTrade(trade);
            }
        });

        socket.on('orderBookUpdate', (data) => {
            renderOrderBook(data);
        });
    }
}

function setupOrderEntry() {
    const buyBtn = document.getElementById('buy-tab-btn');
    const sellBtn = document.getElementById('sell-tab-btn');
    const executeBtn = document.getElementById('execute-order-btn');
    const priceInput = document.getElementById('order-price');
    const amountInput = document.getElementById('order-amount');

    if (buyBtn) {
        buyBtn.onclick = () => {
            currentSide = 'BUY';
            buyBtn.className = 'px-6 py-2 rounded-lg bg-[#00ff87] text-black text-xs font-black uppercase';
            sellBtn.className = 'px-6 py-2 rounded-lg text-gray-500 text-xs font-black uppercase hover:text-white';
            executeBtn.textContent = 'Execute Buy Order';
            executeBtn.className = 'w-full py-4 rounded-2xl bg-[#00ff87] text-black font-black uppercase tracking-[0.2em] shadow-[0_0_40px_rgba(0,255,135,0.15)] hover:scale-[1.02] active:scale-[0.98] transition-all';
        };
    }

    if (sellBtn) {
        sellBtn.onclick = () => {
            currentSide = 'SELL';
            sellBtn.className = 'px-6 py-2 rounded-lg bg-[#ff3b69] text-white text-xs font-black uppercase';
            buyBtn.className = 'px-6 py-2 rounded-lg text-gray-500 text-xs font-black uppercase hover:text-white';
            executeBtn.textContent = 'Execute Sell Order';
            executeBtn.className = 'w-full py-4 rounded-2xl bg-[#ff3b69] text-white font-black uppercase tracking-[0.2em] shadow-[0_0_40px_rgba(255,59,105,0.15)] hover:scale-[1.02] active:scale-[0.98] transition-all';
        };
    }

    if (executeBtn) {
        executeBtn.onclick = async () => {
            if (!currentAssetId) return alert('Select an asset first');
            
            const price = parseFloat(priceInput.value);
            const amount = parseFloat(amountInput.value);

            try {
                const response = await fetch(`${BASE_URL}/trading/order`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({
                        assetId: currentAssetId,
                        side: currentSide,
                        type: 'LIMIT',
                        price,
                        amount
                    })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.message || 'Failed to place order');
                }

                alert(`Order Placed Successfully: ${currentSide} ${amount} at ${price} AC`);
                updateInitialData(currentAssetId); // Refresh UI
            } catch (err) {
                alert('Order Failed: ' + err.message);
            }
        };
    }

    // Update total calculation
    const updateTotal = () => {
        const price = parseFloat(priceInput.value) || 0;
        const amount = parseFloat(amountInput.value) || 0;
        document.getElementById('order-total').textContent = (price * amount).toLocaleString() + ' AC';
    };

    priceInput.oninput = updateTotal;
    amountInput.oninput = updateTotal;
}

function initChart() {
    const container = document.getElementById('chart-container');
    if (!container) return;
    
    chart = LightweightCharts.createChart(container, {
        layout: {
            background: { color: 'transparent' },
            textColor: 'rgba(255, 255, 255, 0.4)',
        },
        grid: {
            vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
            horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
        },
        rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.08)' },
        timeScale: { borderColor: 'rgba(255, 255, 255, 0.08)' },
    });

    candlestickSeries = chart.addCandlestickSeries({
        upColor: '#00ff87',
        downColor: '#ff3b69',
        borderVisible: false,
        wickUpColor: '#00ff87',
        wickDownColor: '#ff3b69',
    });

    window.addEventListener('resize', () => {
        chart.resize(container.clientWidth, container.clientHeight);
    });
}

function subscribeToAsset(assetId) {
    if (!socket) return;
    socket.emit('subscribeAsset', assetId);
}

async function loadAssets() {
    try {
        const response = await fetch(`${BASE_URL}/trading/assets`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const assets = await response.json();
        const dropdown = document.getElementById('asset-dropdown');
        dropdown.innerHTML = '';
        
        assets.forEach(asset => {
            const btn = document.createElement('button');
            btn.className = 'flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 border border-transparent transition-all text-left';
            btn.innerHTML = `
                <div class="w-10 h-10 rounded-lg bg-black/50 flex items-center justify-center font-bold text-xs">
                    ${asset.symbol || 'NFT'}
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold truncate">${asset.name}</p>
                    <p class="text-[9px] text-[#00ff87] uppercase tracking-widest">${asset.lastPrice || 0} AC</p>
                </div>
            `;
            btn.onclick = () => selectAsset(asset);
            dropdown.appendChild(btn);
        });

        if (assets.length > 0) selectAsset(assets[0]);
    } catch (err) {
        console.error('Failed to load trading assets:', err);
    }
}

function selectAsset(asset) {
    currentAssetId = asset._id;
    document.getElementById('current-asset-img').src = asset.imageUrl || 'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=' + asset._id;
    document.getElementById('current-asset-name').textContent = asset.name;
    document.getElementById('current-asset-rarity').textContent = asset.symbol || 'TOKEN';
    document.getElementById('asset-dropdown').classList.add('hidden');
    
    subscribeToAsset(asset._id);
    updateInitialData(asset._id);
}

async function updateInitialData(assetId) {
    const response = await fetch(`${BASE_URL}/trading/assets/${assetId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const { asset, orderBook, history } = await response.json();
    
    renderOrderBook(orderBook);
    renderTrades(history);
    updateTicker(asset.lastPrice);
    
    const candles = generateCandlesFromHistory(history);
    candlestickSeries.setData(candles);
}

function updateChartWithTrade(trade) {
    const time = Math.floor(Date.now() / 1000 / 60) * 60;
    const price = parseFloat(trade.price);
    candlestickSeries.update({ time, open: price, high: price, low: price, close: price });
}

function generateCandlesFromHistory(history) {
    if (!history || history.length === 0) return [];
    const sorted = [...history].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const candles = [];
    sorted.forEach(trade => {
        const time = Math.floor(new Date(trade.createdAt).getTime() / 1000 / 60) * 60;
        const price = parseFloat(trade.price);
        const lastCandle = candles[candles.length - 1];
        if (lastCandle && lastCandle.time === time) {
            lastCandle.close = price;
            lastCandle.high = Math.max(lastCandle.high, price);
            lastCandle.low = Math.min(lastCandle.low, price);
        } else {
            candles.push({ time, open: price, high: price, low: price, close: price });
        }
    });
    return candles;
}

function updateTicker(price) {
    if (!price) return;
    document.getElementById('ticker-price').textContent = parseFloat(price).toFixed(2) + ' AC';
    document.getElementById('mid-price').textContent = parseFloat(price).toFixed(2);
}

function renderOrderBook(data) {
    const bidsCont = document.getElementById('orderbook-bids');
    const asksCont = document.getElementById('orderbook-asks');
    if (!bidsCont || !asksCont) return;

    const renderRows = (container, rows, colorClass) => {
        container.innerHTML = '';
        if (!rows || rows.length === 0) return;
        
        // Mapping backend format if necessary
        const normalizedRows = rows.map(r => ({
            price: r._id || r.price,
            amount: r.totalAmount || r.amount
        }));

        const maxAmount = Math.max(...normalizedRows.map(r => parseFloat(r.amount)));
        normalizedRows.forEach(row => {
            const width = (row.amount / maxAmount) * 100;
            const div = document.createElement('div');
            div.className = 'relative flex items-center justify-between px-3 py-1 hover:bg-white/5 cursor-pointer transition-all';
            div.innerHTML = `
                <div class="order-bar" style="width: ${width}%; background: ${colorClass === 'trade-up' ? '#00ff87' : '#ff3b69'}"></div>
                <span class="${colorClass} font-bold z-10">${parseFloat(row.price).toFixed(2)}</span>
                <span class="text-white font-medium z-10">${row.amount}</span>
            `;
            container.appendChild(div);
        });
    };

    renderRows(bidsCont, data.bids, 'trade-up');
    renderRows(asksCont, data.asks, 'trade-down');
}

function renderTrades(trades) {
    const list = document.getElementById('trades-list');
    if (!list) return;
    list.innerHTML = '';
    if (!trades) return;
    trades.forEach(addTradeToList);
}

function addTradeToList(trade) {
    const list = document.getElementById('trades-list');
    if (!list) return;
    const row = document.createElement('tr');
    row.className = 'border-b border-white/5 hover:bg-white/5 transition-all';
    row.innerHTML = `
        <td class="p-3 ${trade.side === 'BUY' ? 'trade-up' : 'trade-down'} font-bold">${parseFloat(trade.price).toFixed(2)}</td>
        <td class="p-3 font-medium text-gray-300">${trade.amount}</td>
        <td class="p-3 text-gray-600">${new Date(trade.createdAt || Date.now()).toLocaleTimeString()}</td>
    `;
    list.prepend(row);
    if (list.children.length > 50) list.lastElementChild.remove();
}

document.getElementById('asset-selector').onclick = (e) => {
    e.stopPropagation();
    document.getElementById('asset-dropdown').classList.toggle('hidden');
};

document.addEventListener('click', () => {
    const dropdown = document.getElementById('asset-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
});

document.addEventListener('DOMContentLoaded', init);
