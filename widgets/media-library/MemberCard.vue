<script setup lang="ts">
// widgets/media-library/MemberCard.vue
//
// The Video Club's membership card (0.14.0; Guillaume, 2026-11-02: "nice and funny"): on the empty club, before any
// folder, as the club's welcome. Drawn in CSS; the number and the year are this copy's (the year the card is shown).
const since = new Date().getFullYear()
</script>

<template>
  <figure class="media-member-card" aria-label="GEM Video Club membership card">
    <span class="media-member-band" aria-hidden="true"><b>VIDEO CLUB</b></span>
    <span class="media-member-kind" aria-hidden="true">MEMBER</span>
    <span class="media-member-name" aria-hidden="true">GEM</span>
    <span class="media-member-number" aria-hidden="true">No. 0001 · Since {{ since }}</span>
    <span class="media-member-barcode" aria-hidden="true"></span>
    <figcaption class="media-member-sr">Membership card, number 0001, member since {{ since }}</figcaption>
  </figure>
</template>

<style scoped>
.media-member-card { position:relative; width:260px; height:160px; margin:0 auto; overflow:hidden; border-radius:12px; color:#24161f; background:linear-gradient(135deg,#f4ecdc,#e6dac2); box-shadow:0 16px 30px #000a, inset 0 0 0 1px #fff8; transform:rotate(-3deg); }
.media-member-card::after { content:""; position:absolute; inset:0; background:linear-gradient(115deg,transparent 30%,#ffffff55 42%,transparent 54%); pointer-events:none; }
.media-member-band { position:absolute; left:0; right:0; top:18px; height:34px; background:#c8304a; }
.media-member-band b { position:absolute; left:18px; top:7px; color:#fff; font:800 18px/1 "Segoe UI",system-ui,sans-serif; letter-spacing:.14em; }
.media-member-kind { position:absolute; left:18px; top:66px; color:#6b4a59; font:700 10px/1 "Segoe UI",system-ui,sans-serif; letter-spacing:.3em; }
.media-member-name { position:absolute; left:18px; top:80px; font:400 30px/1 "Bungee Video Club",Impact,sans-serif; }
.media-member-number { position:absolute; left:18px; bottom:16px; color:#6b4a59; font:600 10px/1 ui-monospace,Consolas,monospace; }
.media-member-barcode { position:absolute; right:18px; bottom:16px; width:58px; height:26px; background:repeating-linear-gradient(90deg,#24161f 0 2px,transparent 2px 4px,#24161f 4px 5px,transparent 5px 8px); }
.media-member-sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
</style>
