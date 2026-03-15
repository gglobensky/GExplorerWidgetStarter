// src/widgets/code-sandbox/entry.ts
export default {
    id: 'code-sandbox',
    version: '1.0.0',
    Component: {}, // The standalone full-tab widget (to be built later)
    
    // I am hooking into GExchange!
    extensions: [
        {
            targetPoint: 'gexchange.board',
            meta: { label: 'Code Sandbox', icon: 'mdi-code-tags' },
            component: () => import('./SandboxBoard.vue')
        }
    ]
}