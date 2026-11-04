/**
 * In-memory session token store.
 *
 * Browser localStorage/sessionStorage are intentionally not used for bearer
 * credentials: any same-origin script (including injected XSS) can read them.
 * The token is kept only for the lifetime of this page; a reload requires login.
 *
 * A future HttpOnly-cookie migration should be implemented together with
 * credentialed CORS and CSRF protection. Native clients may continue using
 * Authorization: Bearer independently.
 */

let memoryToken = null;

export function getToken() {
	return memoryToken;
}

export function setToken(token) {
	memoryToken = typeof token === 'string' && token.length > 0 ? token : null;
}

export function clearToken() {
	memoryToken = null;
}

export function hasToken() {
	return !!memoryToken;
}

export default { getToken, setToken, clearToken, hasToken };
