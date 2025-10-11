export default function enforceScopedStyles() {
  return {
    name: 'enforce-scoped-styles',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (!id.endsWith('.vue')) return null
      const badStyle = /<style(?![^>]*\bscoped\b)[^>]*>/i.test(code)
      const hasGlobal = /:global|::v-global|:deep|::v-deep|\b(html|body|:root|\*)\b/.test(code)
      if (badStyle || hasGlobal) {
        throw new Error(`Disallowed global styles in ${id}. Use <style scoped> only.`)
      }
      return null
    }
  }
}
