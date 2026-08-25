export function assetUrl(assetPath) {
    const baseUrl = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '/');
    return `${baseUrl}${String(assetPath).replace(/^\/+/, '')}`;
}
