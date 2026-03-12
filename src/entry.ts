// src/widgets/gexchange/entry.ts
import { registerWidgetScheme } from 'gexplorer/widgets'
import Widget from './Widget.vue' // Import our new component

registerWidgetScheme('room', async (path: string) => {
    // If they ask for the root of the room
    if (path.split('/').length <= 3) {
        return [
            { name: 'Project_Architecture.pdf', isDir: false, size: 5242880, isGhost: true },
            { name: 'UI_Mockups.fig', isDir: false, size: 512000, isGhost: false },
            { name: 'Shared_Assets', isDir: true }
        ]
    }
    
    if (path.endsWith('Shared_Assets')) {
        return [{ name: 'logo.png', isDir: false, size: 45000, isGhost: true }]
    }

    return []
})

export default {
    id: 'gexchange',
    version: '1.0.0',
    // MUST request Read capability, or the SDK strips fsListDirSmart!
    capabilities: ['Read'], 
    Component: Widget,
}