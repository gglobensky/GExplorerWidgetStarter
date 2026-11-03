// widgets/corkboard/shared.ts
//
// What Widget.vue shares with the board and the open stack (provide / inject): the desk, the SDK, the ink tool,
// the menus, and the few actions that cross between them (ink undo, adding a picture, the board's page count).
import type { InjectionKey, Ref } from 'vue'
import type { WidgetSdk, WidgetUi } from 'gexplorer/widgets'
import type { Desk } from './store'
import type { Menus } from './menus'
import type { InkTool, InkUndo } from './ink'
import type { PictureSource } from './store'

export type Shared = {
    desk: Desk
    sdk: WidgetSdk
    ui: WidgetUi
    tool: Ref<InkTool>
    inkDone(u: InkUndo): void
    inkUndo(): void
    menus: Menus
    /** A picture (a pasted / dropped file, or a path chosen in GEM Shell's file dialog) into the open note, or pinned on the board. */
    addPicture(file: PictureSource, afterId: string | null): Promise<void>
    /** 0.2.1: GEM Shell's own file dialog (ui.openFiles), pictures only: the paths chosen ([] when cancelled). */
    pickPictures(o: { title: string; acceptLabel: string; multiple?: boolean }): Promise<string[]>
    pages(): number
}

export const SHARED: InjectionKey<Shared> = Symbol('corkboard')
