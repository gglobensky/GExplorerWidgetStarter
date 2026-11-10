import type { WidgetSdk } from 'gexplorer/widgets'

type WebSurfaceSdk = WidgetSdk & {
  /** Future GEM Shell API: the Bugle already has one boundary for adopting an isolated in-app web surface. */
  openWebSurface?: (url: string, options?: { title?: string }) => Promise<unknown>
}

export async function openPublication(sdk: WidgetSdk | undefined, url: string, title?: string): Promise<void> {
  const future = sdk as WebSurfaceSdk | undefined
  if (future?.openWebSurface) {
    await future.openWebSurface(url, { title })
    return
  }
  await sdk?.openUrl?.(url, { title })
}
