<script setup lang="ts">
import { computed, inject, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useScrollHints } from "gexplorer/widgets";
import type { WidgetSdk } from "gexplorer/widgets";
import WeatherIcon from "./WeatherIcon.vue";
import {
  condition,
  createOpenMeteo,
  localDate,
  temperature,
  validLocation,
  type WeatherConfig,
  type WeatherLocation,
  type WeatherReport,
  type WeatherDay,
} from "./weather";

const props = defineProps<{
  sourceId?: string;
  config?: WeatherConfig;
  theme?: Record<string, string>;
  runAction?: (action: { type: "openUrl"; url: string }) => void;
  placement?: { context: "grid" | "sidebar" | "toolbar" | "embedded" };
}>();
const emit = defineEmits<{
  (e: "event", value: { type: "update:config"; payload: WeatherConfig }): void;
}>();
const sdk = inject<WidgetSdk>("widgetSdk");
const lifecycle = sdk?.lifecycle?.();
const report =
  lifecycle?.persistRef<WeatherReport | null>("weather.report.v1", null) ??
  ref<WeatherReport | null>(null);
const cachedLocation =
  lifecycle?.persistRef<string>("weather.location.v1", "") ?? ref("");
const location = ref<WeatherLocation | null>(null);
const loading = ref(false),
  error = ref(""),
  searching = ref(false),
  searchError = ref(""),
  editing = ref(false);
const query = ref(""),
  matches = ref<WeatherLocation[]>([]),
  searched = ref(false);
const activeView = ref<"current" | "forecast">("current");
const root = ref<HTMLElement | null>(null);
const forecastScroller = ref<HTMLElement | null>(null);
const narrow = ref(false);
const minimalCurrent = ref(false);
const stacked = ref(false);
const setupMode = ref<"choice" | "city">("choice");
const now = ref(Date.now()),
  selected = ref(0),
  range = ref<3 | 7>(props.config?.view?.forecastDays === 7 ? 7 : 3);
const flip = ref(""),
  direction = ref(1),
  reducedMotion = ref(true);
const unit = computed(() => (props.config?.view?.units === "F" ? "F" : "C"));
const colored = computed(() => props.config?.view?.coloredIcons !== false);
const atmosphere = computed(() => props.config?.view?.atmosphere !== false);
const refreshInterval = computed(() =>
  Math.max(300000, props.config?.view?.refreshInterval || 900000),
);
const locale = navigator.language || "en";
const region = computed(() =>
  [location.value?.region, location.value?.country].filter(Boolean).join(", "),
);
const locationTip = computed(() => ({
  content: location.value?.name || "Weather location",
  detail: `${region.value || "Location details unavailable"}. Click to change location.`,
}));
const today = computed(() =>
  report.value ? localDate(report.value.timezone, now.value) : "",
);
const futureDays = computed(
  () => report.value?.days.filter((day) => day.date >= today.value) ?? [],
);
const visibleDays = computed(() => futureDays.value.slice(0, range.value));
const stale = computed(
  () =>
    !!report.value &&
    now.value - report.value.fetchedAt > refreshInterval.value * 2,
);
const currentCondition = computed(() =>
  condition(report.value?.current.code ?? null),
);
const scene = computed(() =>
  report.value?.current.isDay === false ? "night" : currentCondition.value.kind,
);
const updated = computed(() =>
  report.value
    ? new Intl.DateTimeFormat(locale, {
        hour: "numeric",
        minute: "2-digit",
        timeZone: report.value.timezone,
      }).format(report.value.fetchedAt)
    : "",
);
const sourceTip = computed(() => ({
  content: "Weather data by Open-Meteo",
  detail: `CC BY 4.0 · Temperatures rounded${unit.value === "F" ? " and converted to °F" : ""}. ${report.value ? `Updated ${updated.value} (${report.value.timezone}).` : ""} Click for source and licence information.`,
}));
function dayTip(day: WeatherDay) {
  return {
    content: `${fullDate(day.date)} · ${condition(day.code).text}`,
    detail: `High ${temp(day.high)} / Low ${temp(day.low)} · Max wind ${day.wind === null ? "unavailable" : `${Math.round(day.wind)} km/h`} · Precipitation ${percent(day.precipitation)}`,
  };
}
const currentTip = computed(() => ({
  content: currentCondition.value.text,
  detail: `${minimalCurrent.value && location.value ? `${location.value.name}${region.value ? `, ${region.value}` : ""}. ` : ""}${futureDays.value[0] ? dayTip(futureDays.value[0]).detail : "Forecast details unavailable."} ${report.value ? `Updated ${updated.value} (${report.value.timezone}).` : ""} Click to refresh.`,
}));
const {
  hasOverflow: forecastHasOverflow,
  atStart: forecastAtStart,
  atEnd: forecastAtEnd,
  scrollByPage: scrollForecastByPage,
} = useScrollHints({
  scrollEl: forecastScroller,
  axis: "x",
  deps: () => `${activeView.value}:${stacked.value}:${range.value}:${visibleDays.value.length}`,
  eps: 2,
  wheel: "transpose",
  pageRatio: 1,
  minPageStep: 48,
});
const hostStyle = computed(() => ({
  "--weather-base": props.theme?.bg || "var(--surface-1, #19222e)",
  "--weather-fg": props.theme?.fg || "var(--fg, #edf3fa)",
  "--weather-border": props.theme?.border || "var(--border, #526477)",
}));
const provider = createOpenMeteo(async (url) => {
  if (!sdk?.networkFetch)
    throw new Error(
      "Network access is unavailable. Enable the weather widget’s Network capability in the shell.",
    );
  return sdk.networkFetch(url);
});
let disposed = false,
  generation = 0,
  searchGeneration = 0,
  ready = false,
  lastAttempt = 0;
let flipTimer: ReturnType<typeof setTimeout> | undefined,
  finishTimer: ReturnType<typeof setTimeout> | undefined,
  viewFlipTimer: ReturnType<typeof setTimeout> | undefined,
  viewFinishTimer: ReturnType<typeof setTimeout> | undefined;
let requestedRange = range.value;
let requestedView = activeView.value;
const viewFlip = ref("");
const viewDirection = ref(1);
const cleanups: Array<() => void> = [];
const locationKey = (l: WeatherLocation) => `${l.latitude},${l.longitude}`;
const temp = (v: number | null | undefined) =>
  temperature(v ?? null, unit.value);
const percent = (v: number | null) => (v === null ? "—" : `${v}%`);
function dayLabel(date: string) {
  return date === today.value
    ? "Today"
    : new Intl.DateTimeFormat(locale, {
        weekday: "short",
        timeZone: "UTC",
      }).format(new Date(`${date}T12:00:00Z`));
}
function fullDate(date: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
function message(e: unknown) {
  return e instanceof Error
    ? e.message
    : "Weather could not be loaded. Please try again.";
}
async function refresh() {
  if (!location.value || loading.value || disposed) return;
  const token = ++generation,
    target = location.value;
  loading.value = true;
  error.value = "";
  lastAttempt = Date.now();
  try {
    const result = await provider.forecast(target);
    if (disposed || token !== generation) return;
    report.value = result;
    cachedLocation.value = locationKey(target);
    now.value = Date.now();
    selected.value = Math.min(
      selected.value,
      Math.max(0, visibleDays.value.length - 1),
    );
  } catch (e) {
    if (!disposed && token === generation) error.value = message(e);
  } finally {
    if (!disposed && token === generation) loading.value = false;
  }
}
function setLocation(value: WeatherLocation) {
  generation++;
  loading.value = false;
  error.value = "";
  location.value = value;
  if (cachedLocation.value !== locationKey(value)) {
    report.value = null;
    cachedLocation.value = "";
    selected.value = 0;
  }
  void refresh();
}
function showView(next: "current" | "forecast") {
  requestedView = next;
  activeView.value = next;
}
function chooseLocation(value: WeatherLocation) {
  editing.value = false;
  setupMode.value = "choice";
  showView("current");
  matches.value = [];
  query.value = "";
  searchGeneration++;
  setLocation(value);
  emit("event", {
    type: "update:config",
    payload: {
      ...props.config,
      data: { ...props.config?.data, location: value },
    },
  });
}
async function search() {
  const text = query.value.trim();
  if (text.length < 2 || searching.value) return;
  const token = ++searchGeneration;
  searching.value = true;
  searchError.value = "";
  searched.value = false;
  matches.value = [];
  try {
    const result = await provider.search(text, locale);
    if (!disposed && token === searchGeneration) {
      matches.value = result;
      searched.value = true;
    }
  } catch (e) {
    if (!disposed && token === searchGeneration) searchError.value = message(e);
  } finally {
    if (!disposed && token === searchGeneration) searching.value = false;
  }
}
function switchRange(next: 3 | 7) {
  if (next === requestedRange) return;
  requestedRange = next;
  direction.value = next === 7 ? 1 : -1;
  clearTimeout(flipTimer);
  clearTimeout(finishTimer);
  const commit = () => {
    range.value = requestedRange;
    selected.value = Math.min(selected.value, range.value - 1);
  };
  if (reducedMotion.value) {
    flip.value = "";
    commit();
    return;
  }
  flip.value = "flip-out";
  flipTimer = setTimeout(() => {
    commit();
    flip.value = "flip-in";
    finishTimer = setTimeout(() => {
      flip.value = "";
    }, 320);
  }, 260);
}
function toggleNarrowView() {
  if (viewFlip.value) return;
  const next = activeView.value === "current" ? "forecast" : "current";
  requestedView = next;
  viewDirection.value = next === "forecast" ? 1 : -1;
  clearTimeout(viewFlipTimer);
  clearTimeout(viewFinishTimer);
  if (reducedMotion.value) {
    activeView.value = next;
    return;
  }
  viewFlip.value = "flip-out";
  viewFlipTimer = setTimeout(() => {
    activeView.value = next;
    viewFlip.value = "flip-in";
    viewFinishTimer = setTimeout(() => {
      viewFlip.value = "";
    }, 320);
  }, 260);
}
watch(
  () => props.config?.data?.location,
  (value) => {
    if (!ready) return;
    if (validLocation(value)) {
      if (!location.value || locationKey(value) !== locationKey(location.value))
        setLocation(value);
      else location.value = value;
    } else {
      generation++;
      location.value = null;
      report.value = null;
      loading.value = false;
    }
  },
  { deep: true },
);
watch(
  () => props.config?.view?.forecastDays,
  (value) => switchRange(value === 7 ? 7 : 3),
);
watch(query, () => {
  searchGeneration++;
  searching.value = false;
  searched.value = false;
  matches.value = [];
  searchError.value = "";
});
onMounted(() => {
  // Observe the allocated box, not content height, so switching layouts cannot
  // feed back into its own breakpoint. Hysteresis avoids flicker during resizing.
  const resize = new ResizeObserver(([entry]) => {
    if (!entry || !root.value) return;
    const { width, height } = entry.contentRect;
    narrow.value = width <= 300;
    minimalCurrent.value = root.value.getBoundingClientRect().width <= 240;
    const fontSize = parseFloat(getComputedStyle(root.value).fontSize) || 14;
    const threshold = Math.max(280, fontSize * 20) + (width < 300 ? 32 : 0);
    stacked.value = height >= threshold - (stacked.value ? 16 : 0);
  });
  if (root.value) resize.observe(root.value);
  cleanups.push(() => resize.disconnect());
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const updateMotion = () => {
    reducedMotion.value = motion.matches;
    if (motion.matches) {
      clearTimeout(flipTimer);
      clearTimeout(finishTimer);
      clearTimeout(viewFlipTimer);
      clearTimeout(viewFinishTimer);
      activeView.value = requestedView;
      range.value = requestedRange;
      selected.value = Math.min(selected.value, range.value - 1);
      flip.value = "";
      viewFlip.value = "";
    }
  };
  updateMotion();
  motion.addEventListener("change", updateMotion);
  cleanups.push(() => motion.removeEventListener("change", updateMotion));
  ready = true;
  const configured = props.config?.data?.location;
  if (validLocation(configured)) {
    location.value = configured;
    if (cachedLocation.value !== locationKey(configured)) report.value = null;
    if (
      !report.value ||
      Date.now() - report.value.fetchedAt >= refreshInterval.value
    )
      void refresh();
  } else report.value = null;
  const tick = () => {
    now.value = Date.now();
    if (
      location.value &&
      now.value - lastAttempt >= refreshInterval.value &&
      (!report.value ||
        now.value - report.value.fetchedAt >= refreshInterval.value)
    )
      void refresh();
  };
  if (lifecycle) {
    cleanups.push(
      lifecycle.keepInterval(tick, 60000),
      lifecycle.onResume(tick),
    );
  } else {
    const timer = setInterval(tick, 60000);
    cleanups.push(() => clearInterval(timer));
  }
});
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  searchGeneration++;
  clearTimeout(flipTimer);
  clearTimeout(finishTimer);
  clearTimeout(viewFlipTimer);
  clearTimeout(viewFinishTimer);
  cleanups.forEach((fn) => fn());
});
</script>

<template>
  <section
    ref="root"
    class="weather"
    :class="{
      atmosphere,
      compact: placement?.context === 'sidebar',
      narrow,
      'minimal-current': minimalCurrent,
      stacked,
      'forecast-view': activeView === 'forecast',
    }"
    :data-scene="scene"
    :style="hostStyle"
    aria-label="Weather"
  >
    <div v-if="!location || editing" class="setup">
      <div class="setup-heading">
        <h2>{{ location ? "Change location" : "Weather where you are" }}</h2>
        <button v-if="location" type="button" @click="editing = false">
          Cancel</button
        ><button
          v-else-if="setupMode === 'city'"
          type="button"
          @click="setupMode = 'choice'"
        >
          Back
        </button>
      </div>
      <div v-if="setupMode === 'choice'" class="location-choice">
        <div class="choice-buttons">
          <button
            type="button"
            disabled
            aria-label="Detect my location — unavailable in this shell"
          >
            Detect my location</button
          ><button type="button" @click="setupMode = 'city'">
            Enter a city
          </button>
        </div>
        <p class="muted">
          Automatic location isn't available in this shell yet.
        </p>
      </div>
      <template v-else>
        <form @submit.prevent="search">
          <label
            >City or postal code<input
              v-model="query"
              autocomplete="off"
              placeholder="Search for a location"
          /></label>
          <button
            type="submit"
            :disabled="searching || query.trim().length < 2"
          >
            {{ searching ? "Searching…" : "Search" }}
          </button>
        </form>
        <p v-if="searchError" role="alert">{{ searchError }}</p>
        <p v-else-if="searched && !matches.length" role="status">
          No matching locations. Try a nearby city or add the country name.
        </p>
        <ul v-if="matches.length" class="results">
          <li v-for="place in matches" :key="locationKey(place)">
            <button type="button" @click="chooseLocation(place)">
              <strong>{{ place.name }}</strong
              ><span>{{
                [place.region, place.country].filter(Boolean).join(", ")
              }}</span>
            </button>
          </li>
        </ul>
      </template>
    </div>
    <template v-else>
      <div class="view-heading">
        <h2 v-if="stacked">Current weather</h2>
        <div v-else-if="minimalCurrent" class="view-switch single-view-switch">
          <button
            type="button"
            class="view-toggle"
            :class="viewFlip"
            :style="{
              '--flip-out': `${90 * viewDirection}deg`,
              '--flip-in': `${-90 * viewDirection}deg`,
            }"
            :aria-label="`${activeView === 'current' ? 'Current weather. Switch to forecast' : 'Forecast. Switch to current weather'}`"
            @click="toggleNarrowView"
          >
            {{ activeView === "current" ? "Current" : "Forecast" }}
          </button>
        </div>
        <div v-else class="view-switch" role="group" aria-label="Weather view">
          <button
            type="button"
            :aria-pressed="activeView === 'current'"
            @click="showView('current')"
          >
            Current
          </button>
          <button
            type="button"
            :aria-pressed="activeView === 'forecast'"
            @click="showView('forecast')"
          >
            Forecast
          </button>
        </div>
        <a
          class="source"
          href="https://open-meteo.com/en/licence"
          aria-label="Weather data by Open-Meteo — source and licence"
          v-gex-tooltip="sourceTip"
          @click.prevent="
            runAction?.({
              type: 'openUrl',
              url: 'https://open-meteo.com/en/licence',
            })
          "
          >ⓘ</a
        >
        <div
          v-if="!stacked && activeView === 'forecast'"
          class="range"
          role="group"
          aria-label="Forecast range"
        >
          <button
            type="button"
            :aria-pressed="range === 3"
            @click="switchRange(3)"
          >
            3 days</button
          ><button
            type="button"
            :aria-pressed="range === 7"
            @click="switchRange(7)"
          >
            7 days
          </button>
        </div>
      </div>
      <header v-if="stacked || activeView === 'current'" class="hero">
        <div v-if="!minimalCurrent" class="location-block">
          <button
            class="location"
            type="button"
            v-gex-tooltip="locationTip"
            :aria-label="`${location.name}${region ? `, ${region}` : ''}. Change weather location.`"
            @click="
              editing = true;
              setupMode = 'choice';
            "
          >
            {{ location.name }}
          </button>
          <div class="muted">{{ region }}</div>
        </div>
        <div class="current">
          <button
            class="temperature"
            type="button"
            v-gex-tooltip="currentTip"
            :aria-label="`${temp(report?.current.temperature)}${unit}. ${currentTip.detail}`"
            :disabled="loading"
            @click="refresh"
          >
            {{ temp(report?.current.temperature)
            }}<span v-if="report?.current.temperature != null">{{ unit }}</span>
          </button>
          <div class="condition">
            {{
              report
                ? currentCondition.text
                : loading
                  ? "Loading weather…"
                  : "Weather unavailable"
            }}
          </div>
          <div v-if="report" class="facts">
            Feels like {{ temp(report.current.feelsLike) }}<br />High
            {{ temp(futureDays[0]?.high) }} / Low {{ temp(futureDays[0]?.low) }}
          </div>
        </div>
      </header>
      <p v-if="error" class="notice" role="alert">
        {{ error }}
        <span v-if="report">Showing the last available forecast.</span>
        <button type="button" :disabled="loading" @click="refresh">
          Try again
        </button>
      </p>
      <p v-else-if="stale" class="notice" role="status">
        This forecast may be out of date.
      </p>
      <div
        v-if="(stacked || activeView === 'forecast') && report"
        class="forecast"
        :class="{ stacked }"
      >
        <div v-if="stacked" class="forecast-heading">
          <h2>Forecast</h2>
          <div class="range" role="group" aria-label="Forecast range">
            <button
              type="button"
              :aria-pressed="range === 3"
              @click="switchRange(3)"
            >
              3 days
            </button>
            <button
              type="button"
              :aria-pressed="range === 7"
              @click="switchRange(7)"
            >
              7 days
            </button>
          </div>
        </div>
        <div
          class="forecast-body"
          :class="flip"
          :style="{
            '--flip-out': `${90 * direction}deg`,
            '--flip-in': `${-90 * direction}deg`,
          }"
        >
          <div
            class="forecast-viewport"
            :class="{ 'has-overflow': forecastHasOverflow }"
          >
            <button
              type="button"
              class="forecast-scroll-control previous"
              :disabled="!forecastHasOverflow || forecastAtStart"
              aria-label="Scroll forecast left"
              @click="scrollForecastByPage(-1)"
            >
              <span aria-hidden="true">{{ forecastAtStart ? "│" : "‹" }}</span>
            </button>
            <div
              ref="forecastScroller"
              class="days"
              :class="{ seven: range === 7 }"
            >
              <button
                v-for="(day, index) in visibleDays"
                :key="day.date"
                type="button"
                class="day"
                v-gex-tooltip="dayTip(day)"
                :aria-pressed="selected === index"
                :aria-label="`${dayTip(day).content}. ${dayTip(day).detail}`"
                @click="selected = index"
              >
                <span>{{ dayLabel(day.date) }}</span
                ><WeatherIcon
                  :kind="condition(day.code).kind"
                  :colored="colored"
                /><span class="high-low"
                  >{{ temp(day.high) }}
                  <span class="muted">{{ temp(day.low) }}</span></span
                >
              </button>
            </div>
            <button
              type="button"
              class="forecast-scroll-control next"
              :disabled="!forecastHasOverflow || forecastAtEnd"
              aria-label="Scroll forecast right"
              @click="scrollForecastByPage(1)"
            >
              <span aria-hidden="true">{{ forecastAtEnd ? "│" : "›" }}</span>
            </button>
          </div>
          <p v-if="!visibleDays.length" class="muted">
            This saved forecast has expired.
            <button type="button" @click="refresh">Refresh</button>
          </p>
        </div>
      </div>
      <p
        v-if="(stacked || activeView === 'forecast') && !report && !error"
        class="notice"
        role="status"
      >
        {{ loading ? "Loading forecast…" : "Forecast unavailable." }}
      </p>
    </template>
  </section>
</template>

<style scoped src="./weather.css"></style>
