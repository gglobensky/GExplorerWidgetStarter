<template>
    <div class="gexchange-poc">
        <h3>GExchange Chat Room</h3>
        
        <button @click="testVfs" class="btn-test">
            Load Room Files via SDK
        </button>

        <div v-if="files.length > 0" class="file-list">
            <h4>Files in room://test-room:</h4>
            <ul>
                <li v-for="file in files" :key="file.Name">
                    <span :style="{ opacity: file.IsGhost ? 0.5 : 1 }">
                        {{ file.IsGhost ? '👻' : '📄' }} {{ file.Name }} 
                        ({{ formatSize(file.Size) }})
                    </span>
                </li>
            </ul>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, inject } from 'vue'
import type { WidgetSdk } from 'gexplorer/widgets'

// 1. Properly inject the capability-gated SDK
const sdk = inject<WidgetSdk>('widgetSdk')

// 2. Reactive state for our UI
const files = ref<any[]>([])

async function testVfs() {
    if (!sdk?.fsListDirSmart) {
        console.error("[GExchange] Missing 'Read' capability or SDK failed to inject!")
        return
    }

    try {
        console.log("[GExchange] Requesting files from room://test-room...")
        
        // 3. Call the SDK exactly like the items widget does!
        const result = await sdk.fsListDirSmart('room://test-room')
        
        if (result.ok && result.entries) {
            files.value = result.entries
            console.log("[GExchange] Success! Files loaded:", result.entries)
        }
    } catch (e) {
        console.error("[GExchange] VFS Request failed:", e)
    }
}

function formatSize(bytes: number) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}
</script>

<style scoped>
.gexchange-poc {
    padding: 1rem;
    background: rgba(20, 20, 20, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #e8e8e8;
    height: 100%;
}
.btn-test {
    padding: 8px 16px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    margin-bottom: 1rem;
}
.btn-test:hover {
    background: #2563eb;
}
.file-list ul {
    list-style: none;
    padding: 0;
}
.file-list li {
    padding: 4px 0;
}
</style>