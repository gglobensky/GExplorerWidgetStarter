import Widget from './Widget.vue'
import AudioCard from './AudioCard.vue'
import bungeeLicense from './assets/Bungee-OFL.txt?raw'
import tmdbLogo from './assets/tmdb-logo.png?inline'

export default {
  api:'1.0',
  id:'media-library',
  version:'0.5.0',
  license:'PolyForm-Noncommercial-1.0.0',
  Component:Widget,
  displayName:'GEM Video Club',
  description:'Browse your media in a nostalgic video-club showroom and open a case for details and scene previews.',
  category:'media',
  icon:'film',
  contexts:{
    grid:{ minSize:{ cols:3, rows:3 }, defaultSize:{ cols:8, rows:6 } },
    sidebar:{ minHeight:260 },
  },
  defaults:{ data:{ selectedId:'', sources:[] }, view:{ atmosphere:true, displayMode:'video-club', sortMode:'title', backgroundSound:true } },
  // The movie's sound going on while the library is off screen (useBackgroundPlayback.ts): its card
  // shows in the operations tray meanwhile; Stop there ends it.
  jobs:{
    background:{ card:AudioCard },
  },
  // Run while the library has your focus (Widget.vue's onCommand).
  commands:[
    { id:'find', name:'Find a title', keys:['Ctrl+F'], description:'Puts the cursor in the search box to find a movie, a series or a genre.' },
    { id:'play', name:'Play the title', keys:['Ctrl+Enter'], description:'Plays the open title, or the selected one, from where you stopped.' },
    { id:'flip', name:'Turn the case over', keys:['F'], description:'Shows the back of the open case (synopsis and scene previews), or its front again.' },
    { id:'watched', name:'Mark as watched / unwatched', keys:['W'], description:'Marks the open or selected title as watched, or clears its watched mark and progress.' },
    { id:'rescan', name:'Scan the media folders again', keys:['F5'], description:'Looks for new and removed videos in your media folders (and matches new titles with TMDB when it is connected).' },
  ],
  // Right-click menus (Widget.vue: sdk.ui().contextMenu, onMenuItem). A title's file is its subject:
  // other widgets' actions and your own commands work on it.
  menuContexts:[
    { id:'media.title', label:'Movie or episode', icon:'🎬', subject:'files' },
    { id:'media.library', label:'Video Club background', icon:'📼' },
  ],
  menus:{
    items:[
      { id:'play', label:'Play', icon:'▶', contexts:['media.title'] },
      { id:'play-from-start', label:'Play from the start', icon:'⏮', contexts:['media.title'] },
      { id:'details', label:'Open the case', icon:'▣', contexts:['media.title'] },
      { id:'title.sep1', type:'separator', contexts:['media.title'] },
      { id:'watched', label:'Mark as watched', icon:'✓', contexts:['media.title'] },
      { id:'unwatched', label:'Mark as unwatched', icon:'↺', contexts:['media.title'] },
      { id:'title.sep2', type:'separator', contexts:['media.title'] },
      { id:'show-file', label:'Show media file', icon:'⌖', contexts:['media.title'] },
      { id:'artwork', label:'Change artwork…', icon:'✎', contexts:['media.title'] },
      { id:'match', label:'Match with TMDB', icon:'ⓘ', contexts:['media.title'] },

      { id:'scan', label:'Scan again', icon:'↻', contexts:['media.library'] },
      { id:'match-all', label:'Refresh TMDB matches', icon:'ⓘ', contexts:['media.library'] },
      { id:'add-folder', label:'Add media folder…', icon:'＋', contexts:['media.library'] },
    ],
  },
  capabilities:[
    { cap:'Read', reason:'Lets you choose and scan one or more local media folders.' },
    { cap:'Media', reason:'Reads local video metadata, extracts scene stills, and streams videos for playback and motion previews.' },
    { cap:'Network', reason:'Optionally matches local movies and episodes with TMDB metadata when you provide a token.' },
  ],
  storage:{ assets:{ mb:512, reason:'Keeps the custom movie covers you choose or capture from playback.' } },
  credits:[
    {
      name:'TMDB',
      url:'https://www.themoviedb.org',
      logo:tmdbLogo,
      text:'This product uses the TMDB API but is not endorsed or certified by TMDB. When you choose **Match with TMDB**, titles, synopses, ratings, posters and episode stills come from [The Movie Database](https://www.themoviedb.org).',
    },
  ],
  notices:[
    {
      name:'Bungee',
      version:'2.000',
      license:'OFL-1.1',
      url:'https://github.com/google/fonts/tree/main/ofl/bungee',
      text:bungeeLicense,
    },
  ],
}
