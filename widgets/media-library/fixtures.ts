import atlasA from './assets/poster-atlas-a.jpg?inline'
import atlasB from './assets/poster-atlas-b.jpg?inline'
import { createMovieLibrary } from './media'

export const posterAtlases: [string, string] = [atlasA, atlasB]
export const sampleMovies = createMovieLibrary(posterAtlases)
