/**
 * Sanitizes HTML to prevent XSS attacks by removing potentially dangerous elements and attributes.
 * This is a basic implementation that allows only safe HTML elements and attributes commonly used
 * by ANSI-to-HTML converters.
 * 
 * For production use, consider using a dedicated library like DOMPurify for more robust sanitization.
 */

const ALLOWED_TAGS = new Set([
	'span',
	'div',
	'b',
	'i',
	'u',
	'strong',
	'em',
	'br',
]);

const ALLOWED_ATTRIBUTES = new Set([
	'class',
	'style',
]);

const DANGEROUS_PROTOCOLS = [
	'javascript:',
	'data:',
	'vbscript:',
	'file:',
];

/**
 * Sanitizes HTML content by removing dangerous tags, attributes, and protocols
 */
export function sanitizeHtml(html: string): string {
	if (typeof window === 'undefined') {
		// Server-side: use basic regex-based sanitization
		return sanitizeHtmlRegex(html);
	}

	// Client-side: use DOM parser for more accurate sanitization
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');
	
	sanitizeNode(doc.body);
	
	return doc.body.innerHTML;
}

/**
 * Recursively sanitize DOM nodes
 */
function sanitizeNode(node: Node): void {
	const nodesToRemove: Node[] = [];
	
	// Process child nodes first
	for (let i = 0; i < node.childNodes.length; i++) {
		const child = node.childNodes[i];
		
		if (child.nodeType === Node.ELEMENT_NODE) {
			const element = child as Element;
			const tagName = element.tagName.toLowerCase();
			
			// Remove disallowed tags
			if (!ALLOWED_TAGS.has(tagName)) {
				nodesToRemove.push(child);
				continue;
			}
			
			// Remove disallowed attributes
			const attributesToRemove: string[] = [];
			for (let j = 0; j < element.attributes.length; j++) {
				const attr = element.attributes[j];
				const attrName = attr.name.toLowerCase();
				
				if (!ALLOWED_ATTRIBUTES.has(attrName)) {
					attributesToRemove.push(attr.name);
				} else if (attrName === 'style') {
					// Sanitize style attribute
					const sanitizedStyle = sanitizeStyle(attr.value);
					element.setAttribute('style', sanitizedStyle);
				}
			}
			
			// Remove disallowed attributes
			for (const attrName of attributesToRemove) {
				element.removeAttribute(attrName);
			}
			
			// Recursively sanitize child nodes
			sanitizeNode(child);
		} else if (child.nodeType === Node.TEXT_NODE) {
			// Text nodes are safe
			continue;
		} else {
			// Remove comments and other node types
			nodesToRemove.push(child);
		}
	}
	
	// Remove marked nodes
	for (const nodeToRemove of nodesToRemove) {
		node.removeChild(nodeToRemove);
	}
}

/**
 * Sanitize CSS style attribute
 */
function sanitizeStyle(style: string): string {
	// Remove any potentially dangerous CSS
	const dangerous = [
		'expression',
		'javascript:',
		'import',
		'@import',
		'behavior',
		'binding',
		'-moz-binding',
	];
	
	let sanitized = style;
	for (const term of dangerous) {
		sanitized = sanitized.replace(new RegExp(term, 'gi'), '');
	}
	
	return sanitized;
}

/**
 * Regex-based sanitization for server-side rendering
 * This is a more conservative approach that removes all HTML tags except allowed ones
 */
function sanitizeHtmlRegex(html: string): string {
	// Remove script tags and their content
	let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
	
	// Remove event handlers (onclick, onerror, etc.)
	sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
	sanitized = sanitized.replace(/on\w+\s*=\s*[^\s>]*/gi, '');
	
	// Remove dangerous protocols
	for (const protocol of DANGEROUS_PROTOCOLS) {
		sanitized = sanitized.replace(
			new RegExp(`(href|src|data)\\s*=\\s*["']?${protocol}`, 'gi'),
			'$1=""'
		);
	}
	
	// Remove style tags
	sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
	
	// Remove iframe, object, embed tags
	sanitized = sanitized.replace(/<(iframe|object|embed|link|meta)[^>]*>/gi, '');
	
	return sanitized;
}
