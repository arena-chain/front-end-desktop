'use strict';
const { apiRequest } = require('../../../shared/api');

// Helper to map backend data to frontend model
const mapItemToAvatar = (item) => ({
    _id: item._id,
    name: item.nftId?.name || 'Unknown NFT',
    image: item.nftId?.imageUrl || 'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=' + item._id,
    description: item.nftId?.description || 'Arena digital collectible',
    rarity: item.nftId?.rarity || 'COMMON',
    price: item.nftId?.price || 0,
    ownerId: item.ownerId,
    listed: item.status === 'LISTED',
    listPrice: item.listPrice,
    createdAt: item.createdAt,
});

const nftService = {
    getMarketplace: async (filters = {}) => {
        const data = await apiRequest('/nft/marketplace', { params: filters });
        return Array.isArray(data) ? data.map(mapItemToAvatar) : [];
    },
    getMyNfts: async () => {
        const data = await apiRequest('/nft/my');
        return Array.isArray(data) ? data.map(mapItemToAvatar) : [];
    },
    getHistory: async (limit = 20) => {
        return await apiRequest('/nft/transactions/history', { params: { limit } });
    },
    buy: async (id) => {
        const data = await apiRequest(`/nft/${id}/buy`, { method: 'POST' });
        return mapItemToAvatar(data);
    },
    list: async (id, price) => {
        const data = await apiRequest(`/nft/${id}/list`, { method: 'POST', body: JSON.stringify({ listPrice: price }) });
        return mapItemToAvatar(data);
    },
    unlist: async (id) => {
        const data = await apiRequest(`/nft/${id}/unlist`, { method: 'POST' });
        return mapItemToAvatar(data);
    },
    createDraft: async (formData) => {
        const { BASE_URL, getAccessToken } = require('../../../shared/api');
        const response = await fetch(`${BASE_URL}/nft`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getAccessToken()}`
            },
            body: formData
        });
        
        if (!response.ok) {
            const err = await response.json().catch(() => ({ message: 'Server Error' }));
            throw new Error(err.message || 'Failed to create NFT');
        }
        
        return await response.json();
    }
};

module.exports = nftService;
