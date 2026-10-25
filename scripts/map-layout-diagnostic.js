/**
 * Map layout diagnostic.
 *
 * Run in the browser console on the dashboard, then paste the output. It walks
 * the ancestor chain of the map canvas and reports the resolved box of each
 * element, which is what tells us why the map paints only part of its area.
 *
 * Usage:
 *   1. Open the dashboard at localhost:3000.
 *   2. Open DevTools, then the Console tab.
 *   3. Paste the contents of this file and press Enter.
 *   4. Send the printed JSON back.
 */
(function mapLayoutDiagnostic() {
    const canvas = document.querySelector('.maplibregl-canvas');
    if (!canvas) {
        console.log('RESULT: no .maplibregl-canvas on the page.');
        return;
    }

    const rows = [];
    let el = canvas;

    for (let i = 0; el && i < 10; i += 1) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        rows.push({
            level: i,
            tag: el.tagName,
            classes: (el.className || '').toString().slice(0, 80),
            box: {
                width: Math.round(r.width),
                height: Math.round(r.height),
                x: Math.round(r.x),
                y: Math.round(r.y),
            },
            computed: {
                height: cs.height,
                minHeight: cs.minHeight,
                flex: cs.flex,
                display: cs.display,
                position: cs.position,
                overflow: cs.overflow,
            },
        });
        el = el.parentElement;
    }

    const report = {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        devicePixelRatio: window.devicePixelRatio,
        canvasAttributes: {
            width: canvas.getAttribute('width'),
            height: canvas.getAttribute('height'),
        },
        canvasCss: { width: canvas.clientWidth, height: canvas.clientHeight },
        ancestorChain: rows,
    };

    console.log('MAP_LAYOUT_REPORT_START');
    console.log(JSON.stringify(report, null, 2));
    console.log('MAP_LAYOUT_REPORT_END');
})();
