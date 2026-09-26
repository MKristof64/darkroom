declare global {
 interface Window { OV_CONFIG?: { apiOrigin: string; basePath: string } }
}
export const apiUrl = () => `${typeof window === 'undefined' ? '' : window.OV_CONFIG?.apiOrigin || ''}/api/game`;
export const homePath = () => typeof window === 'undefined' ? '/' : window.OV_CONFIG?.basePath || '/';
export const inviteUrl = (code: string) => new URL(`${homePath()}?szoba=${code}`, window.location.origin).href;
