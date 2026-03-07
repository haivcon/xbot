const ethers = require('ethers');

function normalizeAddressSafe(address) {
    if (!address) {
        return null;
    }
    try {
        return ethers.getAddress(address);
    } catch (error) {
        return null;
    }
}

function shortenAddress(address) {
    if (!address || address.length < 10) {
        return address || '';
    }
    const normalized = normalizeAddressSafe(address) || address;
    return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

module.exports = {
    normalizeAddressSafe,
    shortenAddress
}