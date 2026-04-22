'use strict';

const { apiRequest, BASE_URL } = require('../../../shared/api');

const tradingService = {
    // Get historical candles for charts
    getChartData: async (assetId, interval = '1h') => {
        try {
            // Simulated data for now if backend doesn't have a dedicated chart endpoint
            // In a real scenario, this would call /trading/candles/:assetId
            return generateMockCandles(100);
        } catch (err) {
            console.error('Failed to fetch chart data:', err);
            return [];
        }
    },

    // Get live order book
    getOrderBook: async (assetId) => {
        try {
            // Mocking order book data structure
            return {
                bids: generateMockOrders(15, 'buy'),
                asks: generateMockOrders(15, 'sell')
            };
        } catch (err) {
            console.error('Failed to fetch order book:', err);
            return { bids: [], asks: [] };
        }
    },

    // Get recent trades
    getRecentTrades: async (assetId) => {
        try {
            return generateMockTrades(20);
        } catch (err) {
            console.error('Failed to fetch trade history:', err);
            return [];
        }
    },

    // Execute an order
    placeOrder: async (orderData) => {
        return await apiRequest('/nft/items/transfer', { // Using existing transfer as mock for trade
            method: 'POST',
            body: JSON.stringify(orderData)
        });
    }
};

// --- MOCK DATA GENERATORS ---
function generateMockCandles(count) {
    let candles = [];
    let lastClose = 2500;
    const now = Date.now();
    for (let i = 0; i < count; i++) {
        let open = lastClose;
        let close = open + (Math.random() - 0.5) * 50;
        let high = Math.max(open, close) + Math.random() * 20;
        let low = Math.min(open, close) - Math.random() * 20;
        candles.push({
            time: now - (count - i) * 3600000,
            open, high, low, close
        });
        lastClose = close;
    }
    return candles;
}

function generateMockOrders(count, type) {
    let orders = [];
    let basePrice = 2500;
    for (let i = 0; i < count; i++) {
        const offset = type === 'buy' ? -(i * 5) : (i * 5);
        orders.push({
            price: basePrice + offset + (Math.random() * 2),
            amount: (Math.random() * 10).toFixed(2),
            total: 0
        });
    }
    return orders;
}

function generateMockTrades(count) {
    let trades = [];
    const now = Date.now();
    for (let i = 0; i < count; i++) {
        trades.push({
            id: Math.random().toString(36).substr(2, 9),
            price: 2500 + (Math.random() - 0.5) * 20,
            amount: (Math.random() * 5).toFixed(2),
            time: now - i * 60000,
            type: Math.random() > 0.5 ? 'buy' : 'sell'
        });
    }
    return trades;
}

module.exports = tradingService;
