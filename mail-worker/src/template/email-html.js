import { parseHTML } from 'linkedom';
import domainUtils from '../utils/domain-uitls';

export default function emailHtmlTemplate(html, domain) {

	const { document } = parseHTML(html);
	document.querySelectorAll('script').forEach(script => script.remove());
	const safeHtml = document.toString().replace(/{{domain}}/g, domainUtils.toOssDomain(domain) + '/');
	const safeHtmlJson = JSON.stringify(safeHtml).replace(/</g, '\\u003c');
	const fallbackDocument = parseHTML(safeHtml).document;
	fallbackDocument.querySelectorAll('script, style, link[rel="stylesheet"]').forEach(el => el.remove());
	const fallbackBody = fallbackDocument.querySelector('body');
	const fallbackBodyStyle = sanitizeStyle(fallbackBody?.getAttribute('style') || '');
	const fallbackContent = fallbackBody ? fallbackBody.innerHTML : fallbackDocument.toString();

	return `<!DOCTYPE html>
<html lang='en' >
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            background: #FFF;
        }

        .content-box {
            padding: 15px 10px;
            width: 100%;
            height: 100%;
            overflow: auto;
            font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .content-html {
            width: 100%;
            height: 100%;
        }

        .fallback-content {
            background: #FFFFFF;
            width: 100%;
            max-width: 100%;
            overflow-x: auto;
            word-break: break-word;
            color: #13181D;
            ${fallbackBodyStyle ? `${fallbackBodyStyle};` : ''}
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
        }

        .fallback-content img:not(table img) {
            max-width: 100% !important;
            height: auto !important;
        }

        .fallback-content table {
            max-width: 100% !important;
        }
    </style>
</head>
<body>
    <div class='content-box'>
        <div id='container' class='content-html'>
            <div class="fallback-content">
                ${fallbackContent}
            </div>
        </div>
    </div>

    <script>
        function renderHTML(html) {
            const container = document.getElementById('container');
            const shadowRoot = container.attachShadow({ mode: 'open' });

            const bodyStyleRegex = /<body[^>]*style="([^"]*)"[^>]*>/i;
            const bodyStyleMatch = html.match(bodyStyleRegex);
            const bodyStyle = sanitizeBodyStyle(bodyStyleMatch ? bodyStyleMatch[1] : '');
            const cleanedHtml = html.replace(/<\\/?body[^>]*>/gi, '');

            shadowRoot.innerHTML = \`
                <style>
                    :host {
                        all: initial;
                        width: 100%;
                        height: 100%;
                        font-family: Inter, -apple-system, BlinkMacSystemFont,
                                    'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        font-size: 14px;
                        line-height: 1.5;
                        color: #13181D;
                        word-break: break-word;
                        overflow: auto;
                    }

                    h1, h2, h3, h4 {
                        font-size: 18px;
                        font-weight: 700;
                    }

                    p {
                        margin: 0;
                    }

                    a {
                        text-decoration: none;
                        color: #0E70DF;
                    }

                    .shadow-content {
                        background: #FFFFFF;
                        width: fit-content;
                        height: fit-content;
                        min-width: 100%;
                        \${bodyStyle ? bodyStyle : ''}
                    }

                    img:not(table img) {
                        max-width: 100% !important;
                        height: auto !important;
                    }
                </style>
                <div class="shadow-content">
                    \${cleanedHtml}
                </div>
            \`;

            autoScale(shadowRoot, container);
        }

        function autoScale(shadowRoot, container) {
            if (!shadowRoot || !container) return;

            const shadowContent = shadowRoot.querySelector('.shadow-content');
            if (!shadowContent) return;

            const parentWidth = container.offsetWidth;
            const childWidth = shadowContent.scrollWidth;
            if (childWidth === 0) return;

            shadowRoot.host.style.zoom = parentWidth / childWidth;
        }

        function sanitizeBodyStyle(style) {
            const blockedProps = new Set([
                'animation',
                'clip',
                'clip-path',
                'display',
                'height',
                'left',
                'opacity',
                'overflow',
                'position',
                'top',
                'transform',
                'visibility',
                'width',
                'z-index'
            ]);

            return style
                .split(';')
                .map(rule => rule.trim())
                .filter(rule => {
                    if (!rule || /[{}<>]/.test(rule)) {
                        return false;
                    }
                    const index = rule.indexOf(':');
                    if (index === -1) {
                        return false;
                    }
                    const prop = rule.slice(0, index).trim().toLowerCase();
                    return prop && !blockedProps.has(prop);
                })
                .join(';');
        }

        renderHTML(${safeHtmlJson});
    </script>
</body>
</html>`
}

function sanitizeStyle(style) {
	const blockedProps = new Set([
		'animation',
		'clip',
		'clip-path',
		'display',
		'height',
		'left',
		'opacity',
		'overflow',
		'position',
		'top',
		'transform',
		'visibility',
		'width',
		'z-index'
	]);

	return style
		.split(';')
		.map(rule => rule.trim())
		.filter(rule => {
			if (!rule || /[{}<>]/.test(rule)) {
				return false;
			}
			const index = rule.indexOf(':');
			if (index === -1) {
				return false;
			}
			const prop = rule.slice(0, index).trim().toLowerCase();
			return prop && !blockedProps.has(prop);
		})
		.join(';\n            ');
}
