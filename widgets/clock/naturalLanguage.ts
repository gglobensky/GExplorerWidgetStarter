export type NaturalAppointment = {
  title: string
  date: string
  time: string
  allDay: boolean
  durationMinutes: number
  reminderMinutes: number
  summary: string
}

export type NaturalAppointmentResult = { value: NaturalAppointment; error?: never } | { value?: never; error: string }

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const clean = (value: string) => value.replace(/\s+/g, ' ').replace(/^\s*[-–—,:;]+|[-–—,:;]+\s*$/g, '').trim()

function calendarDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month, day, 12)
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null
}

/** Conservative local parser. It fills an editor; it never creates an event itself. */
export function parseNaturalAppointment(input: string, base = new Date()): NaturalAppointmentResult {
  let rest = clean(input)
  if (!rest) return { error: 'Describe the appointment first.' }
  rest = clean(rest.replace(/^remind\s+me(?:\s+to)?\s+/i, ''))
  rest = rest.replace(/^remind me(?:\s+to)?\s+/i, '')

  let date = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12)
  let matchedDate = false
  const remove = (match: string) => { rest = clean(rest.replace(match, ' ')) }

  const iso = rest.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/i)
  if (iso) {
    const parsed = calendarDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    if (!parsed) return { error: 'That calendar date is not valid.' }
    date = parsed; matchedDate = true; remove(iso[0])
  }
  if (!matchedDate) {
    const monthNames = MONTHS.map(month => month.slice(0, 3)).join('|')
    const month = rest.match(new RegExp(`\\b(${MONTHS.join('|')}|${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'))
    if (month) {
      const monthIndex = MONTHS.findIndex(value => value === month[1].toLowerCase() || value.startsWith(month[1].toLowerCase().slice(0, 3)))
      let year = month[3] ? Number(month[3]) : base.getFullYear()
      let parsed = calendarDate(year, monthIndex, Number(month[2]))
      if (!parsed) return { error: 'That calendar date is not valid.' }
      if (!month[3] && parsed.getTime() < new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12).getTime()) parsed = calendarDate(++year, monthIndex, Number(month[2]))!
      date = parsed; matchedDate = true; remove(month[0])
    }
  }
  if (!matchedDate) {
    const relative = rest.match(/\b(today|tomorrow)\b/i)
    if (relative) {
      date.setDate(date.getDate() + (relative[1].toLowerCase() === 'tomorrow' ? 1 : 0))
      matchedDate = true; remove(relative[0])
    }
  }
  if (!matchedDate) {
    const weekday = rest.match(new RegExp(`\\b(?:next\\s+)?(${DAYS.join('|')}|sun|mon|tue(?:s)?|wed(?:nes)?|thu(?:rs)?|fri|sat)\\b`, 'i'))
    if (weekday) {
      const token = weekday[1].toLowerCase().slice(0, 3)
      const target = DAYS.findIndex(value => value.startsWith(token))
      let delta = (target - date.getDay() + 7) % 7
      if (delta === 0) delta = 7
      date.setDate(date.getDate() + delta)
      matchedDate = true; remove(weekday[0])
    }
  }

  let allDay = false, time = '12:00'
  const allDayMatch = rest.match(/\ball[ -]?day\b/i)
  if (allDayMatch) { allDay = true; time = '09:00'; remove(allDayMatch[0]) }
  if (!allDay) {
    const namedTime = rest.match(/\bat\s+(noon|midnight)\b/i)
    const numericTime = rest.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/i)
    if (namedTime) {
      time = namedTime[1].toLowerCase() === 'noon' ? '12:00' : '00:00'; remove(namedTime[0])
    } else if (numericTime) {
      let hour = Number(numericTime[1]), minute = Number(numericTime[2] ?? 0)
      const meridiem = numericTime[3]?.toLowerCase().replace(/\./g, '')
      if (minute > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) return { error: 'That time is not valid.' }
      if (meridiem === 'pm' && hour < 12) hour += 12
      if (meridiem === 'am' && hour === 12) hour = 0
      time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`; remove(numericTime[0])
    }
  }

  let durationMinutes = allDay ? 1440 : 60
  const duration = rest.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b/i)
  if (duration) {
    durationMinutes = Math.round(Number(duration[1]) * (/^h/i.test(duration[2]) ? 60 : 1))
    if (durationMinutes < 1 || durationMinutes > 10080) return { error: 'Use a duration between one minute and seven days.' }
    remove(duration[0])
  }

  let reminderMinutes = 10
  const noReminder = rest.match(/\b(?:with\s+)?no reminder\b/i)
  const reminder = rest.match(/\bremind(?:er)?(?:\s+me)?\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|days?)\s+before\b/i)
  if (noReminder) { reminderMinutes = -1; remove(noReminder[0]) }
  else if (reminder) {
    const unit = reminder[2].toLowerCase()
    reminderMinutes = Math.round(Number(reminder[1]) * (unit.startsWith('d') ? 1440 : unit.startsWith('h') ? 60 : 1))
    remove(reminder[0])
  }

  rest = clean(rest.replace(/^remind\s+me(?:\s+to)?\s+/i, ''))
  if (!rest) return { error: 'I found the date and time, but not the appointment name.' }
  if (!rest) return { error: 'Add an appointment name, such as “Dentist tomorrow at 2pm”.' }
  const title = rest.charAt(0).toUpperCase() + rest.slice(1)
  const dateLabel = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: date.getFullYear() === base.getFullYear() ? undefined : 'numeric' })
  const timeLabel = allDay ? 'all day' : new Date(2000, 0, 1, ...time.split(':').map(Number) as [number, number]).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const reminderLabel = reminderMinutes < 0 ? 'no reminder' : reminderMinutes === 0 ? 'at start' : `${reminderMinutes} min before`
  return { value: { title, date: isoDate(date), time, allDay, durationMinutes, reminderMinutes, summary: `${title} · ${dateLabel}, ${timeLabel} · ${reminderLabel}` } }
}
