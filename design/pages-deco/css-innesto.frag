/* ══ L'INNESTO: sull'ammiraglia la medaglia È il sigillo della scatola.
   A riposo c'è solo lo stemma; al passaggio la scatola del Packaging
   sale da dietro e la medaglia si posa sul suo fronte. ═══════════════ */
.sm.eroe .palco3d { position:relative; min-height:300px; min-width:320px; }
.ms-scena { position:absolute; inset:0; display:grid; place-items:center;
  perspective:1400px; pointer-events:none; }
.ms-box { --w:196px; --h:212px; --d:112px; --lid:20px;
  position:relative; width:var(--w); height:var(--h);
  transform:rotateX(-16deg) rotateY(-29deg) translateY(34px) scale(.9);
  transform-style:preserve-3d; opacity:0;
  transition:transform .9s var(--molla), opacity .55s var(--ease); }
.ms-face { position:absolute; backface-visibility:hidden; }
.ms-front { inset:0; transform:translateZ(calc(var(--d)/2));
  border-radius:4px;
  background:radial-gradient(130% 85% at 18% 0%, rgba(255,215,0,.10),
    transparent 55%),
    linear-gradient(163deg,#151518 0%,#0C0C0E 55%,#09090B 100%);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.05),
    inset 0 1px 0 rgba(255,255,255,.06); }
.ms-front::after { content:''; position:absolute; left:0; right:0; top:0;
  height:var(--lid); border-radius:4px 4px 0 0;
  background:linear-gradient(180deg,rgba(255,255,255,.055),
    rgba(255,255,255,.012)); }
.ms-front::before { content:''; position:absolute; left:0; right:0;
  top:var(--lid); height:1px; z-index:1;
  background:linear-gradient(90deg, rgba(255,215,0,0),
    rgba(255,215,0,.7) 30%, rgba(255,215,0,.7) 70%, rgba(255,215,0,0));
  box-shadow:0 0 12px 1px rgba(255,215,0,.3); }
.ms-front .ms-marchio { position:absolute; top:calc(var(--lid) + 10px);
  left:14px; font-family:var(--display); font-size:9px; font-weight:500;
  letter-spacing:.34em; color:var(--text-2); }
.ms-front .ms-codice { position:absolute; bottom:10px; left:14px;
  font-family:ui-monospace,Menlo,monospace; font-size:7px;
  letter-spacing:.24em; color:rgba(250,250,250,.35); }
.ms-side { top:0; left:50%; width:var(--d); height:var(--h);
  margin-left:calc(var(--d)/-2);
  transform:rotateY(90deg) translateZ(calc(var(--w)/2)); border-radius:4px;
  background:radial-gradient(130% 70% at 35% 0%, rgba(255,215,0,.06),
    transparent 55%), linear-gradient(195deg,#0E0E10,#070708 70%);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.035); }
.ms-side::before { content:''; position:absolute; left:0; right:0;
  top:var(--lid); height:1px;
  background:linear-gradient(90deg, rgba(255,215,0,.45),
    rgba(255,215,0,.1)); }
.ms-top { left:0; top:50%; width:var(--w); height:var(--d);
  margin-top:calc(var(--d)/-2);
  transform:rotateX(90deg) translateZ(calc(var(--h)/2)); border-radius:4px;
  background:linear-gradient(180deg,#1B1C20,#101013);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.055); }
.ms-top .ms-banda { position:absolute; left:0; right:0; top:50%;
  height:15px; transform:translateY(-50%); opacity:.92;
  background:linear-gradient(90deg, rgba(255,215,0,0),
    rgba(255,215,0,.8) 28%, rgba(255,215,0,.8) 72%, rgba(255,215,0,0));
  box-shadow:0 0 18px rgba(255,215,0,.35); }
.ms-ombra { position:absolute; left:50%; bottom:2px; width:220px;
  height:26px; transform:translateX(-50%); border-radius:50%;
  background:radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,.8),
    transparent 70%); filter:blur(8px); opacity:0;
  transition:opacity .55s var(--ease); }
/* il gesto: la scatola sale, la medaglia si posa sul fronte */
@media (hover:hover) and (pointer:fine) {
  .sm.eroe:hover .ms-box { opacity:1;
    transform:rotateX(-16deg) rotateY(-29deg) translateY(6px) scale(1); }
  .sm.eroe:hover .ms-ombra { opacity:1; }
  .sm.eroe:hover .stemma { animation-play-state:paused;
    transform:translate(6px, 34px) scale(.5)
      rotateX(-10deg) rotateY(-16deg);
    filter:drop-shadow(0 14px 12px rgba(0,0,0,.6))
      drop-shadow(0 0 22px var(--ca)); }
}
/* senza mouse (touch) e con reduced-motion: la composizione è FISSA —
   scatola presente e medaglia già posata, nessun segreto nascosto */
@media (hover:none), (prefers-reduced-motion:reduce) {
  .sm.eroe .ms-box { opacity:1;
    transform:rotateX(-16deg) rotateY(-29deg) translateY(6px) scale(1); }
  .sm.eroe .ms-ombra { opacity:1; }
  .sm.eroe .stemma { animation:none;
    transform:translate(6px, 34px) scale(.5)
      rotateX(-10deg) rotateY(-16deg); }
}
