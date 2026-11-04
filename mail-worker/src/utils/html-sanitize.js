import { parseHTML } from 'linkedom';

/**
 * Conservative sanitizer for untrusted email HTML.
 *
 * Email content is rendered in a browser (including inside a ShadowRoot).
 * Strip active content and CSS rather than trying to make arbitrary email CSS
 * safe. Remote image loads are blocked to prevent tracking pixels and IP leaks.
 */

const FORBIDDEN_TAGS = [
	'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button',
	'textarea', 'select', 'option', 'base', 'link', 'meta', 'template',
	'noscript', 'frame', 'frameset', 'applet', 'audio', 'video', 'source',
	'title', 'svg', 'math', 'foreignObject'
];

const FORBIDDEN_ATTRS = [
	'srcdoc', 'ping', 'formaction', 'http-equiv', 'srcset',
	'background', 'poster', 'data'
];

const SAFE_LINK_SCHEME = /^(?:https?:|mailto:|tel:|cid:|[/#?])/i;
const SAFE_EMBEDDED_IMAGE = /^(?:cid:|data:image\/(?:png|jpe?g|gif|webp|bmp);base64,)/i;

/**
 * @param {string} html Untrusted email HTML.
 * @returns {string} Sanitized HTML fragment.
 */
export function sanitizeEmailHtml(html) {
	if (!html) return '';

	let document;
	try {
		({ document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`));
	} catch (e) {
		console.error('sanitizeEmailHtml parse failed:', e);
		return '';
	}

	// Remove active/embedded content, including SVG/MathML and CSS containers.
	document.querySelectorAll(FORBIDDEN_TAGS.join(',')).forEach(el => el.remove());

	document.querySelectorAll('*').forEach(el => {
		const names = Array.from(el.attributes || []).map(a => a.name);

		for (const name of names) {
			const lower = name.toLowerCase();
			const value = (el.getAttribute(name) || '').trim();

			// Inline event handlers and CSS are not needed for safe mail display.
			if (lower.startsWith('on') || lower === 'style' || FORBIDDEN_ATTRS.includes(lower)) {
				el.removeAttribute(name);
				continue;
			}

			if (lower === 'href') {
				const normalized = value.replace(/[\u0000-\u0020\u007F]/g, '');
				if (!SAFE_LINK_SCHEME.test(normalized)) el.removeAttribute(name);
				continue;
			}

			if (lower === 'src') {
				// Only inline/CID raster images are allowed; never fetch remote images.
				const normalized = value.replace(/[\u0000-\u0020\u007F]/g, '');
				if (!SAFE_EMBEDDED_IMAGE.test(normalized)) el.removeAttribute(name);
			}
		}
	});

	// External links must not gain access to the opener window.
	document.querySelectorAll('a[href]').forEach(el => {
		el.setAttribute('target', '_blank');
		el.setAttribute('rel', 'noopener noreferrer');
	});

	return document.body.innerHTML;
}

export default sanitizeEmailHtml;
