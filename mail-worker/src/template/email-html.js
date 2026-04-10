import { parseHTML } from 'linkedom';
import domainUtils from '../utils/domain-uitls';

export default function emailHtmlTemplate(html, domain) {

	const { document } = parseHTML(html);
	document.querySelectorAll('script').forEach(script => script.remove());
	const body = document.querySelector('body');
	const bodyStyle = body?.getAttribute('style') || '';
	const content = body ? body.innerHTML : document.toString();
	const safeContent = content.replace(/{{domain}}/g, domainUtils.toOssDomain(domain) + '/');

	return `<!DOCTYPE html>
<html lang='en' >
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <style>
        * {
            box-sizing: border-box;
        }

        html, body {
            margin: 0;
            padding: 0;
            background: #FFF;
            width: 100%;
        }

        .content-box {
            padding: 15px 10px;
            width: 100%;
            font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #13181D;
            word-break: break-word;
        }

        .content-html {
            width: 100%;
        }

        .shadow-content {
            background: #FFFFFF;
            width: 100%;
            max-width: 100%;
            overflow-x: auto;
            ${bodyStyle}
        }

        .shadow-content img:not(table img) {
            max-width: 100% !important;
            height: auto !important;
        }

        .shadow-content table {
            max-width: 100% !important;
        }

        .shadow-content pre,
        .shadow-content code {
            white-space: pre-wrap;
            word-break: break-word;
        }
    </style>
</head>
<body>
    <div class='content-box'>
        <div class='content-html'>
            <div class="shadow-content">
                ${safeContent}
            </div>
        </div>
    </div>
</body>
</html>`
}
