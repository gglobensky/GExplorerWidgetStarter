import Widget from './Widget.vue'

export default {
  api:'1.0',
  id:'media-library',
  version:'0.4.0',
  Component:Widget,
  displayName:'Media Library',
  description:'Browse movies on video-store shelves and open a case for details and scene previews.',
  category:'media',
  icon:'film',
  contexts:{
    grid:{ minSize:{ cols:3, rows:3 }, defaultSize:{ cols:8, rows:6 } },
    sidebar:{ minHeight:260 },
  },
  defaults:{ data:{ selectedId:'signal-north', sources:[] }, view:{ atmosphere:true, libraryMode:'shelf' } },
  capabilities:[
    { cap:'Read', reason:'Lets you choose and scan one or more local media folders.' },
    { cap:'Media', reason:'Reads local video metadata and streams videos for playback and scene previews.' },
    { cap:'Network', reason:'Optionally matches local movies and episodes with TMDB metadata when you provide a token.' },
  ],
}
