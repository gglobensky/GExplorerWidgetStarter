<!-- widgets/console/TerminalPart.vue -->
<!--
    GEM CONSOLE'S TERMINAL PART (0.2.0, 2026-11-15; roadmap group 3 F6b): provided for GEM Shell's point
    'shell.terminal' (entry.ts provides). Another widget (GEM Forge) shows it with sdk.parts().mount(el,
    'shell.terminal', 'console'); GEM Shell draws it over that widget's element from its own copy of this code, and it
    RUNS AS THAT WIDGET: its sdk (inject) is the host's, narrowed by GEM Shell to terminal(), ui().menu / confirm /
    snack, clipboardSetText, openUrl and platform. Its consoles are the host's (its grant, its tray card) and end with it.
    The point's contract (exposed; each resolves { ok } or { ok: false, error }):
      print(text)        shown in the "Tool output" tab (no shell behind it), never typed
      run(line)          typed by GEM Shell at the console's prompt (session.run): the active console, else the last one
                         still running, else the usual shell started where cd last said (it runs at its first prompt)
      cd(folder)         the console in use moves there (at its prompt; waiting while a command runs); none: where the
                         next one starts
      newSession(shell?) a new console (the usual shell, or that one)
    and emits exit(code) when a console ends. Props from GEM Shell: hostName, textScale.
-->
<template>
    <div ref="rootEl" class="gc-widget p-part">
        <ConsoleView :con="con" mode="part" />
    </div>
</template>

<script setup lang="ts">
import { inject, markRaw, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'
import ConsoleView from './ConsoleView.vue'
import { createConsoles } from './consoles'
import { termColors } from './termTheme'
import './console.css'

const props = defineProps<{ hostName?: string; textScale?: number }>()
const emit = defineEmits<{ (e: 'exit', code: number): void }>()

const sdk = inject<WidgetSdk>('widgetSdk')!
const ui = sdk.ui!()
const rootEl = ref<HTMLElement | null>(null)

const con = markRaw(createConsoles(sdk, {
    notify: text => { void ui.snack({ id: 'gem-console-part', text, dedupe: 'replace', timeoutMs: 5000 }) },
    theme: () => termColors(rootEl.value),
    openLink: url => { void sdk.openUrl?.(url) },
    textScale: () => Number(props.textScale) || 1,
    onExit: code => emit('exit', code),
}))
watch(() => props.textScale, () => con.applyTextScale())

// The host's consoles still running (it reloaded, or this part was shown again): drawn again
onMounted(() => { void con.init() })
onBeforeUnmount(() => con.dispose())

const done = { ok: true as const }
const failed = (error: string) => ({ ok: false as const, error })

defineExpose({
    print(text: string) {
        if (typeof text !== 'string') return failed('Text expected.')
        con.printOutput(text)
        return done
    },
    async run(line: string) {
        const err = await con.runLine(line)
        return err ? failed(err) : done
    },
    async cd(folder: string) {
        await con.moveTo(folder)
        return done
    },
    async newSession(shell?: string) {
        const err = await con.open(shell ?? null)
        return err ? failed(err) : done
    },
})
</script>
