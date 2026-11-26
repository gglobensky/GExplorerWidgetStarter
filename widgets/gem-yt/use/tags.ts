// Your tags: channels grouped as you like (YouTube has no folders for subscriptions). One document of the widget type
// (core/tags.ts: shared by every copy); each copy shows one tag, or every channel, or a pick of them. Named in the
// bar (a new one, or the current one renamed), deleted after a confirmation. One kind of tag: a tag also holds the
// channels whose creators use its name as a keyword (core/tags.ts withCreators); the creators' shared keywords are
// offered as tags to adopt.
import { computed, nextTick, ref } from 'vue'
import { TAGS_DOC, addTag, removeTag, renameTag, setMember, tagNamed, toggleTag, withCreators, type Tags } from '../core/tags'

export function useTags(o: {
  sdk: any
  /** the copy's state: the tag it shows (its stored key is still `aisle`) */
  remember: (tagId: string | null) => void
  /** the channels shown are put in order again */
  settle: () => void
  setPicked: (ids: string[]) => void
  /** a channel's keywords as read (normalized), if read yet */
  keywordsOf: (channelId: string) => readonly string[] | undefined
  channelIds: () => readonly string[]
}) {
  const tagsDoc = ref<Tags>({ version: 1, aisles: [] })
  /** The tag this copy shows (null: every channel). */
  const tagId = ref<string | null>(null)
  /** The tags as shown (yours and the creators' keywords: see withCreators); write through tagsDoc */
  const tags = computed(() => withCreators(tagsDoc.value, o.keywordsOf, o.channelIds()))
  const currentTag = computed(() => tags.value.aisles.find(a => a.id === tagId.value) ?? null)
  /** The pick (per copy): in Every channel, the channels shown are narrowed to these. */
  const picked = ref<string[]>([])
  const naming = ref<{ mode: 'new'; channelId?: string } | { mode: 'rename' } | null>(null)
  const nameDraft = ref('')
  const nameInput = ref<HTMLInputElement | null>(null)
  const confirmingDelete = ref(false)

  function tagsChanged() {
    tagsDoc.value = { version: 1, aisles: tagsDoc.value.aisles.map(a => ({ ...a, channels: [...a.channels] })) }
    if (!o.sdk?.inPreview?.()) void o.sdk?.configWrite?.(TAGS_DOC, tagsDoc.value).catch((err: unknown) => console.warn('[GEM YT] tags not saved', err))
  }
  function showTag(id: string | null) {
    tagId.value = id
    o.remember(id)
    confirmingDelete.value = false
    o.settle()
  }
  function setTag(ev: Event) {
    const select = ev.target as HTMLSelectElement
    const v = select.value
    if (v === '__new') { select.value = tagId.value ?? (picked.value.length ? '__picked' : ''); startNaming({ mode: 'new' }); return }
    if (v === '__picked') { showTag(null); return }
    // a keyword your creators share: adopted as a tag (it fills itself)
    if (v.startsWith('topic:')) { select.value = tagId.value ?? ''; adoptTopic(v.slice(6)); return }
    // Every channel: the pick let go too
    if (!v) { o.setPicked([]); showTag(null); return }
    showTag(v)
  }
  function startNaming(n: NonNullable<typeof naming.value>) {
    naming.value = n
    nameDraft.value = n.mode === 'rename' ? currentTag.value?.name ?? '' : ''
    void nextTick(() => { nameInput.value?.focus(); nameInput.value?.select() })
  }
  function commitName() {
    const n = naming.value
    if (!n || !nameDraft.value.trim()) { naming.value = null; return }
    if (n.mode === 'rename') { if (tagId.value && renameTag(tagsDoc.value, tagId.value, nameDraft.value)) tagsChanged() }
    else {
      const a = addTag(tagsDoc.value, nameDraft.value)
      if (a) {
        if (n.channelId) toggleTag(tagsDoc.value, a.id, n.channelId)
        tagsChanged()
        if (!n.channelId) showTag(a.id)
      }
    }
    naming.value = null
  }
  function deleteTag() {
    if (tagId.value && removeTag(tagsDoc.value, tagId.value)) tagsChanged()
    showTag(null)
  }
  /** A channel put in a tag, or taken out (one its creator's keyword put in stays out) */
  function toggleIn(tid: string, channelId: string) {
    const on = !tags.value.aisles.find(a => a.id === tid)?.channels.includes(channelId)
    setMember(tagsDoc.value, tid, channelId, on, tags.value.auto.get(tid)?.has(channelId) ?? false)
    tagsChanged()
  }
  /** Several channels put in a tag at once */
  function addMembers(tid: string, ids: readonly string[]) {
    const shown = new Set(tags.value.aisles.find(a => a.id === tid)?.channels ?? [])
    const auto = tags.value.auto.get(tid)
    let changed = false
    for (const id of ids) if (!shown.has(id)) changed = setMember(tagsDoc.value, tid, id, true, auto?.has(id) ?? false) || changed
    if (changed) tagsChanged()
  }
  /** A keyword your creators use: the tag of that name (made if there's none yet), shown */
  function adoptTopic(term: string) {
    let t = tagNamed(tagsDoc.value, term)
    if (!t) {
      const made = addTag(tagsDoc.value, term.charAt(0).toUpperCase() + term.slice(1))
      if (!made) return
      tagsChanged()
      t = made
    }
    showTag(t.id)
  }
  return { tagsDoc, tags, tagId, currentTag, addMembers, adoptTopic, picked, naming, nameDraft, nameInput, confirmingDelete, tagsChanged, showTag, setTag, startNaming, commitName, deleteTag, toggleIn }
}
