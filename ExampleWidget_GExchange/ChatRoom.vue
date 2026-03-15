<template>
    <div class="gexchange-container">
        <header class="chat-header">
            <div class="header-left">
                <span class="room-title"># dev-talk</span>
                <span class="room-status online"></span>
            </div>
            <div class="header-right">
                <button class="icon-btn" title="Open Room in Items Widget">
                    📁
                </button>
                <button class="icon-btn" @click="toggleSidebar" title="Toggle Participants">
                    👥
                </button>
            </div>
        </header>

        <div class="chat-body">
            
            <main class="chat-feed">
                <div class="message-dummy">
                    <span class="msg-author">System</span>
                    <span class="msg-text">Welcome to the GExchange room.</span>
                </div>
                </main>

            <aside class="chat-sidebar" v-if="showSidebar">
                <div class="sidebar-section">
                    <h4>Participants (3)</h4>
                    <ul class="user-list">
                        <li>🟢 User A 🔇</li>
                        <li>🟢 User B</li>
                        <li>⚪ User C</li>
                    </ul>
                </div>
                <div class="sidebar-section">
                    <h4>Shared Files</h4>
                    <ul class="file-list">
                        <li>📄 Project_Architecture.pdf</li>
                        <li>🖼️ UI_Mockups.fig</li>
                    </ul>
                </div>
            </aside>
        </div>

        <footer class="chat-footer">
            <div class="plugin-tabs">
                <button 
                    @click="showBoard = false" 
                    :class="{ active: !showBoard }"
                    class="tab-btn"
                >
                    💬 Chat
                </button>
                <button 
                    @click="showBoard = true" 
                    :class="{ active: showBoard }"
                    class="tab-btn"
                >
                    🛠️ Board
                </button>

                <select v-if="showBoard" v-model="activeBoardIndex" @change="loadBoard" class="board-select">
                    <option v-for="(ext, index) in availableBoards" :key="index" :value="index">
                        {{ ext.extension.meta.label }}
                    </option>
                </select>
            </div>

            <div class="plugin-canvas">
                <textarea 
                    v-if="!showBoard" 
                    class="chat-input"
                    placeholder="Type a message..."
                ></textarea>
                
                <component 
                    v-else-if="loadedComponent" 
                    :is="loadedComponent" 
                />
                <div v-else class="loading-state">Loading board...</div>
            </div>
        </footer>
    </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, onMounted } from 'vue'

const showSidebar = ref(true)
const showBoard = ref(false)
const availableBoards = ref<any[]>([])
const activeBoardIndex = ref(0)
const loadedComponent = shallowRef<any>(null)

function toggleSidebar() {
    showSidebar.value = !showSidebar.value
}

onMounted(() => {

})

async function loadBoard() {
    const extDef = availableBoards.value[activeBoardIndex.value]
    if (extDef) {
        const mod = await extDef.extension.component()
        loadedComponent.value = mod.default || mod
    }
}
</script>

<style scoped>
/* Main Shell Container */
.gexchange-container {
    display: grid;
    grid-template-rows: 48px 1fr auto;
    height: 100%;
    background-color: #121212;
    color: #e0e0e0;
    font-family: sans-serif;
    border: 1px solid #2a2a2a;
    border-radius: 6px;
    overflow: hidden;
}

/* Header */
.chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 16px;
    background-color: #1a1a1a;
    border-bottom: 1px solid #2a2a2a;
}
.room-title {
    font-weight: bold;
    font-size: 1.1em;
}
.icon-btn {
    background: transparent;
    border: none;
    color: #a0a0a0;
    cursor: pointer;
    font-size: 1.2em;
    padding: 4px 8px;
}
.icon-btn:hover { color: #fff; }

/* Body Layout */
.chat-body {
    display: flex;
    overflow: hidden;
}
.chat-feed {
    flex-grow: 1;
    padding: 16px;
    overflow-y: auto;
}
.chat-sidebar {
    width: 250px;
    background-color: #161616;
    border-left: 1px solid #2a2a2a;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 24px;
}
.sidebar-section h4 {
    margin: 0 0 8px 0;
    color: #888;
    text-transform: uppercase;
    font-size: 0.8em;
}
.user-list, .file-list {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 0.9em;
}
.user-list li, .file-list li { margin-bottom: 6px; }

/* Footer / Plugin Area */
.chat-footer {
    background-color: #1a1a1a;
    border-top: 1px solid #2a2a2a;
    display: flex;
    flex-direction: column;
}
.plugin-tabs {
    display: flex;
    gap: 2px;
    padding: 8px 16px 0 16px;
}
.tab-btn {
    background: #2a2a2a;
    color: #888;
    border: none;
    padding: 6px 16px;
    border-radius: 6px 6px 0 0;
    cursor: pointer;
}
.tab-btn.active {
    background: #333;
    color: #fff;
}
.board-select {
    margin-left: auto;
    background: #2a2a2a;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 2px 8px;
}
.plugin-canvas {
    background: #333;
    padding: 16px;
    min-height: 80px;
}
.chat-input {
    width: 100%;
    min-height: 60px;
    background: #222;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 8px;
    resize: vertical;
}
</style>