<script setup lang="ts">
// widgets/weather/WeatherSetup.vue (1.3.0, 2026-10-28): choosing the weather's location. Shown in the
// widget when there is room, and in a popover from the compact strip (one grid row high, the toolbar),
// which has none. It only searches (props.search) and reports the place chosen (props.onChoose).
// 1.4.0 (2026-10-30): "Detect my location" (props.detect: GEM Shell's sdk.geolocate, the user's city).
import { ref, watch } from "vue";
import type { WeatherLocation } from "./weather";

const props = defineProps<{
  /** A location is set: the heading says "Change location" and Cancel shows. */
  hasLocation: boolean;
  search: (text: string) => Promise<WeatherLocation[]>;
  onChoose: (place: WeatherLocation) => void;
  /** 1.4.0: the user's city (absent: the shell has no location for widgets). Rejects with an Error carrying `code`. */
  detect?: () => Promise<WeatherLocation>;
  onCancel?: () => void;
  /** In a popover (the SDK passes it): framed on its own, with the widget's colors. */
  close?: () => void;
}>();

const mode = ref<"choice" | "city">("choice");
const query = ref("");
const matches = ref<WeatherLocation[]>([]);
const searching = ref(false);
const searched = ref(false);
const error = ref("");
let generation = 0;
const detecting = ref(false);
const detectError = ref("");

/** What the user reads when detecting fails (codes: GEM Shell's sdk.geolocate). */
function detectMessage(e: unknown): string {
  switch ((e as { code?: string })?.code) {
    case "declined": return "Location wasn't allowed. You can enter a city instead.";
    case "os-off": return "Location is turned off in the system settings. Enter a city, or turn it on and try again.";
    case "timeout": return "Finding your city took too long. Try again, or enter a city.";
    case "no-gesture": return "Click Detect my location to find your city.";
    default: return "Your city couldn't be found. Enter a city instead.";
  }
}

async function runDetect() {
  if (!props.detect || detecting.value) return;
  detecting.value = true;
  detectError.value = "";
  try {
    props.onChoose(await props.detect());
  } catch (e) {
    detectError.value = detectMessage(e);
  } finally {
    detecting.value = false;
  }
}

const keyOf = (l: WeatherLocation) => `${l.latitude},${l.longitude}`;

watch(query, () => {
  generation++;
  searching.value = false;
  searched.value = false;
  matches.value = [];
  error.value = "";
});

async function run() {
  const text = query.value.trim();
  if (text.length < 2 || searching.value) return;
  const token = ++generation;
  searching.value = true;
  error.value = "";
  searched.value = false;
  matches.value = [];
  try {
    const result = await props.search(text);
    if (token === generation) {
      matches.value = result;
      searched.value = true;
    }
  } catch (e) {
    if (token === generation)
      error.value = e instanceof Error ? e.message : "The search failed. Please try again.";
  } finally {
    if (token === generation) searching.value = false;
  }
}

function cancel() {
  if (props.onCancel) props.onCancel();
  else props.close?.();
}
</script>

<template>
  <div class="setup" :class="{ 'in-popover': !!close }">
    <div class="setup-heading">
      <h2>{{ hasLocation ? "Change location" : "Weather where you are" }}</h2>
      <button v-if="hasLocation || close" type="button" @click="cancel">Cancel</button>
      <button v-else-if="mode === 'city'" type="button" @click="mode = 'choice'">Back</button>
    </div>
    <div v-if="mode === 'choice'" class="location-choice">
      <div class="choice-buttons">
        <button v-if="detect" type="button" :disabled="detecting" @click="runDetect">{{ detecting ? "Finding your city…" : "Detect my location" }}</button>
        <button v-else type="button" disabled aria-label="Detect my location — unavailable in this shell">Detect my location</button>
        <button type="button" @click="mode = 'city'">Enter a city</button>
      </div>
      <p v-if="detectError" role="alert">{{ detectError }}</p>
      <p v-else-if="detect" class="muted">Detecting finds the city you're in, never your exact position.</p>
      <p v-else class="muted">Automatic location isn't available in this shell yet.</p>
    </div>
    <template v-else>
      <form @submit.prevent="run">
        <label>City or postal code<input v-model="query" autocomplete="off" placeholder="Search for a location" /></label>
        <button type="submit" :disabled="searching || query.trim().length < 2">{{ searching ? "Searching…" : "Search" }}</button>
      </form>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-else-if="searched && !matches.length" role="status">No matching locations. Try a nearby city or add the country name.</p>
      <ul v-if="matches.length" class="results">
        <li v-for="place in matches" :key="keyOf(place)">
          <button type="button" @click="onChoose(place)">
            <strong>{{ place.name }}</strong><span>{{ [place.region, place.country].filter(Boolean).join(", ") }}</span>
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
/* Moved from weather.css (1.3.0). In a popover it isn't inside .weather: its own colors then. */
.setup {
  --setup-fg: var(--weather-fg, var(--fg, #edf3fa));
  --setup-panel: var(--weather-panel, color-mix(in srgb, var(--surface-1, #19222e) 93%, var(--fg, #edf3fa)));
  --setup-border: var(--weather-border, var(--border, #526477));
  --setup-muted: var(--weather-muted, color-mix(in srgb, var(--fg, #edf3fa) 74%, var(--surface-1, #19222e)));
  color: var(--setup-fg);
}
.setup.in-popover {
  width: 300px;
  max-width: 100%;
  padding: 12px;
  box-sizing: border-box;
  font: 14px/1.4 "Segoe UI", sans-serif;
}
.setup button,
.setup input {
  font: inherit;
  color: inherit;
}
.setup button {
  cursor: pointer;
  border: 1px solid var(--setup-border);
  background: var(--setup-panel);
  border-radius: 7px;
  padding: 5px 9px;
}
.setup button:disabled {
  cursor: default;
  opacity: 0.6;
}
.setup button:focus-visible,
.setup input:focus-visible {
  outline: 2px solid var(--accent, #65b6f4);
  outline-offset: 2px;
}
.setup h2,
.setup p {
  margin: 0;
}
.setup h2 {
  font-size: 14px;
  font-weight: 600;
}
.muted {
  color: var(--setup-muted);
}
.setup-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.setup-heading button {
  font-size: 12px;
  padding: 3px 7px;
}
.choice-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.choice-buttons button {
  flex: 1;
  font-size: 12px;
}
.setup form {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 6px;
}
.setup label {
  display: block;
  flex: 1 1 140px;
  min-width: 0;
  font-size: 12px;
}
.setup input {
  display: block;
  min-width: 0;
  width: 100%;
  padding: 6px;
  margin-top: 3px;
  background: var(--setup-panel);
  border: 1px solid var(--setup-border);
  border-radius: 6px;
  box-sizing: border-box;
}
.setup p {
  margin-top: 7px;
  font-size: 12px;
}
.results {
  padding: 0;
  margin: 8px 0;
  list-style: none;
  display: grid;
  gap: 4px;
}
.results button {
  width: 100%;
  text-align: left;
}
.results span {
  display: block;
  font-size: 12px;
  color: var(--setup-muted);
}
</style>
