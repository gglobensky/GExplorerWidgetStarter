# Weather v1

Widget-only implementation. The shell, Items, local-player, and P2P are untouched.

## Build

Run `pnpm typecheck:weather`, `pnpm test:weather`, and `pnpm build:weather` from the starter directory. Output: `dist/runtime-widgets/weather/index.js`. The module uses the shell's `/runtime/vue.js` and injected `widgetSdk`; Vue is not bundled. No build command copies files to GEM Shell.

For the isolated sample-data preview: `pnpm exec vite --config vite.weather-preview.config.ts`, then open `/ExampleWidget_Weather/preview/`. Append `?setup` to exercise location selection. Preview code is not included in the production entry.

## Configuration

The shell owns configuration persistence. Location selection emits the existing `event` / `update:config` contract with the merged config. This is handled by the shell's GridLayout and Sidebar. Preferences are consumed reactively from `config.view`; this widget does not create a second settings screen.

```json
{
  "data": {
    "location": { "name": "Montréal", "region": "Québec", "country": "Canada", "latitude": 45.5, "longitude": -73.6 }
  },
  "view": {
    "units": "C",
    "coloredIcons": true,
    "atmosphere": true,
    "forecastDays": 3,
    "refreshInterval": 900000
  }
}
```

Units accept C/F; forecastDays accepts 3/7. Refresh is clamped to at least five minutes. Wind is currently displayed in km/h independently of temperature units. Legacy NWS grid strings prompt for a new location. No location is silently inferred or sent from device geolocation.

The first implementation focuses on the grid, with responsive sidebar fallback. Toolbar presentation is deliberately not declared until its opening/detail interaction is implemented against the shell API.

## Data and service choice

Open-Meteo adapter: https://open-meteo.com/en/docs and https://open-meteo.com/en/docs/geocoding-api . The normalized model stores Celsius, km/h, nullable readings, date-only forecast days, and the location time zone. Current conditions are provider model data, not a claim of direct station observation. Additional providers can implement WeatherProvider.

The free hosted Open-Meteo endpoint is for non-commercial use. Public/commercial distribution requires a service/licensing decision; no secret API key is embedded. Review https://open-meteo.com/en/pricing before release. Attribution is a linked info icon beside the view switch; its host tooltip names Open-Meteo, the licence, rounding/unit conversion, and the update time. The link opens the source/licence page through the shell action API.

## Compact views (v1.1)

As of v1.2, the widget automatically stacks Current above Forecast when its allocated height is sufficient (about 300px at the default text size, a little more in narrow placements). Shorter placements retain the view switch. Shrinking restores the user's selected compact view and forecast range. Details remain in tooltips in either layout. No new Shell API is required; see [API-GAPS.md](./API-GAPS.md) for the actual outstanding host requests.

Both layouts distribute spare vertical space between their upper and lower sections. In compact mode the controls stay at the top while Current or Forecast rests at the bottom. In stacked mode Current stays at the top and Forecast rests at the bottom.

Current is the initial view; Forecast contains the three/seven-day card flip. Day details use the shell's globally registered `v-gex-tooltip` directive on focus/hover. The current temperature also shows forecast details and refreshes when clicked. No detail panel or footer occupies the widget.

The narrow forecast layout begins at its original breakpoint and presents one day at a time with the shell's horizontal `useScrollHints` composable. Chevrons page by one card, and an unavailable direction is represented by a straight edge bar. Native scrollbars remain hidden, while trackpad and mouse-wheel input can move the same horizontal strip.

Current has an intermediate layout. It keeps the city and region plus the standard left-aligned Current/Forecast pair while Forecast is already using its narrow card presentation. At 240px, the city block is removed, its full location moves into the temperature tooltip, and the view pair becomes one centered flipping button. If the forecast range wraps below that button, the button remains centered on its own row.

First use offers city entry and indicates that automatic detection is unavailable. No geolocation/Wi-Fi service exists in the inspected public widget SDK; implementing it in the widget via browser geolocation or IP lookup would cross the agreed API boundary. A consent-aware device-location API is a future Shell task. No automatic location request occurs.

## Host integration notes

- Networking argument inconsistency: `widget-sdk.ts` calls the net wrapper with `(widgetType, url, options)`, while `widgets/net/index.ts` declares `(widgetType, widgetId, url, init)` and passes four arguments to a three-argument bridge. A URL-only GET still reaches the bridge correctly (in the wrapper's widgetId position). Options can be lost. This widget uses the documented SDK call; no workaround or shell modification is included.
- Network abort/timeout is not in the local public SDK declaration. Responses from obsolete searches/locations are ignored; a stalled transport still needs host resolution.
- Lifecycle persistence retains the last report across suspension/remount, not application restarts. Refresh pauses with the lifecycle timer. Configuration persistence uses host events.
- CSS/browser reduced-motion is honored and updates live. Windows-to-WebView preference propagation needs verification in the real shell.
- English UI text remains for this first pass; location search language, forecast labels, and dates use the browser locale. Full translated UI remains future work.
- Actual shell loading and consent behavior must be verified in GEM Shell. Build and isolated preview do not prove host integration.
