// docs/forge-samples/clock/zones.ts
//
// World clocks: the cities shown when the clock is large, and the time format.
export const CITIES: [string, string][] = [
    ['Tokyo', 'Asia/Tokyo'],
    ['Paris', 'Europe/Paris'],
    ['Vancouver', 'America/Vancouver'],
]

export const fmt = (d: Date, timeZone?: string) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone })
