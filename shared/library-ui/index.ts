// shared/library-ui: the media libraries' look (2.0.0, 2026-10-31). What any shop of boxes shares: the item core, the
// box (in the style of its kind), the classic shelf, the store floor and their styles. Each widget keeps what only it
// has (the Video Club: movie fields, seasons, extras, the movie detail page; the Game Library: stores, launching).
import './library-ui.css'

export { default as ArtworkFrame } from './ArtworkFrame.vue'
export { default as LibraryCase } from './LibraryCase.vue'
export { default as MediaShelf } from './MediaShelf.vue'
export { default as LibraryFloor } from './LibraryFloor.vue'
export { default as StoreDetail } from './StoreDetail.vue'
export { default as LibraryMenu } from './LibraryMenu.vue'
export * from './types'
export * from './skins'
export * from './fly'
export { useBoxFlight } from './useBoxFlight'
export * from './boxNav'
export { default as SkinPicker } from './SkinPicker.vue'
export { default as SkinEditor } from './SkinEditor.vue'
export * from './useSkins'
export * from './shelfLabels'
