// src/widgets/music/src/entry.ts
import Widget from './Widget.vue'
export default {
  api: '1.0',
  id: 'local-player',
  version: '1.0.0',
  Component: Widget,
  contexts: {
	  grid: {
		layouts: [
		  { id: 'compact', icon: '─', tooltip: 'Compact Player' },
		  { id: 'expanded', icon: '▦', tooltip: 'Player + Queue' },
		  { id: 'visualizer', icon: '〰', tooltip: 'Visualizer Mode' },  // Only makes sense in grid!
		],
	  },
	  
	  sidebar: {
		layouts: [
		  { id: 'compact', icon: '─', tooltip: 'Mini Player' },
		  { id: 'expanded', icon: '▦', tooltip: 'Full Player' },
		],
	  },
	},
  defaults: {
    queueName: 'Queue',
    volume: 0.9,
    repeat: 'off',
    shuffle: false,
  },
  capabilities: [],
}