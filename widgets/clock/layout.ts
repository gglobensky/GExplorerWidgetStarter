export type ClockTab = 'clock' | 'calendar' | 'timers' | 'stopwatch'
export type ClockSize = 's' | 'm' | 'l'

export type ClockLayout = {
  size: ClockSize
  pages: Record<ClockTab, boolean>
  compactCalendar: boolean
  richTimeTools: boolean
  compactStyledTimer: boolean
  timersPerPage: number
}

/** One source of truth for the widget's JS-driven responsive decisions. CSS still owns visual reflow. */
export function clockLayout(width: number, height: number): ClockLayout {
  const size: ClockSize = width < 170 || height < 110 ? 's' : width < 420 || height < 270 ? 'm' : 'l'
  return {
    size,
    pages: {
      clock: true,
      calendar: width >= 150 && height >= 72,
      timers: width >= 250 && height >= 125,
      stopwatch: width >= 150 && height >= 80,
    },
    compactCalendar: size !== 'l' && width >= 280 && height >= 145,
    richTimeTools: size === 'l' && width >= 460 && height >= 330,
    compactStyledTimer: size === 'm' && width >= 380 && height >= 175,
    timersPerPage: height < 380 ? 2 : height < 540 ? 4 : 6,
  }
}
