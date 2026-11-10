// docs/forge-samples/clock/zones.ts
//
// World clocks: the cities shown when the clock is large, and the time format.
export const CITIES: [string, string][] = [
    ['Tokyo', 'Asia/Tokyo'],
    ['Paris', 'Europe/Paris'],
    ['Vancouver', 'America/Vancouver'],
]

export const timeZoneLabel = (timeZone: string) =>
    timeZone.split('/').pop()?.replace(/_/g, ' ') || timeZone

/** The WebView's complete IANA list, with a small fallback for older engines. */
export const TIME_ZONES: string[] = (() => {
    const supportedValuesOf = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
    const values = supportedValuesOf?.('timeZone') ?? CITIES.map(([, zone]) => zone)
    return [...new Set(values)].sort((a, b) => timeZoneLabel(a).localeCompare(timeZoneLabel(b)))
})()

export const fmt = (d: Date, timeZone?: string) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone })
