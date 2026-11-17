/* =====================================================================
   IL ÉTAIT UNE FOIS — comportements du site
   Site 100 % statique : aucun back-end, aucun service payant.
   La réservation prépare un e-mail / SMS / message pré-rempli + un .ics.
   ===================================================================== */
(() => {
  'use strict';

  /* ---------- Données du salon (à modifier ici si elles changent) ---------- */
  const SALON = {
    nom: 'Il était une fois',
    tel: '+33383272939',
    telAff: '03 83 27 29 39',
    email: 'iletaitunefois54600@gmail.com',
    // Numéro de MOBILE du salon (ex. '+33612345678'). Le 03 83 27 29 39 est un fixe :
    // les SMS n'y arrivent pas. Si un mobile est renseigné ici, le bouton « Envoyer par SMS » apparaît.
    sms: '',
    instagram: 'iletaitunefois54520',
    adresse: '59 avenue de la Libération, 54520 Laxou',
    // 0 = dimanche … 6 = samedi ; null = fermé
    horaires: {
      0: null,
      1: ['14:00', '19:00'],
      2: ['09:00', '19:00'],
      3: ['09:00', '19:00'],
      4: ['09:00', '19:00'],
      5: ['09:00', '19:00'],
      6: ['09:00', '14:00']
    },
    pasCreneau: 30,        // minutes entre deux créneaux proposés
    dernierDepart: 60,     // dernier départ = fermeture − 60 min
    delaiJourMeme: 120,    // pour aujourd'hui : créneaux à plus de 2 h
    semaines: 5            // nombre de semaines affichées dans le calendrier
  };

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGSAP = !!(window.gsap && window.ScrollTrigger);
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  let lenis = null;

  /* ---------- Utilitaires ---------- */
  /* Recalcule les positions des animations quand la hauteur de la page change */
  const refreshLayout = () => { if (window.ScrollTrigger) requestAnimationFrame(() => ScrollTrigger.refresh()); };
  const pad = n => String(n).padStart(2, '0');
  const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const fmtH = min => { const h = Math.floor(min / 60), m = min % 60; return m ? `${h}h${pad(m)}` : `${h}h`; };
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

  function parisNow() {
    const p = {};
    new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
    const y = +p.year, m = +p.month, d = +p.day, h = (+p.hour) % 24, min = +p.minute;
    return { y, m, d, h, min, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
  }
  const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  /* Découpe un titre en mots (ou lettres) masqués, en conservant les <em>, <br>… */
  function splitInto(el, chars) {
    const label = el.textContent.replace(/\s+/g, ' ').trim();
    el.setAttribute('aria-label', label);
    const out = [];
    const mk = (cls) => { const s = document.createElement('span'); s.className = cls; return s; };
    const walk = (node, parent) => {
      Array.from(node.childNodes).forEach(ch => {
        if (ch.nodeType === 3) {
          ch.textContent.split(/(\s+)/).forEach(tok => {
            if (!tok) return;
            if (/^\s+$/.test(tok)) { parent.appendChild(document.createTextNode(' ')); return; }
            const w = mk('w'); w.setAttribute('aria-hidden', 'true');
            if (chars) {
              Array.from(tok).forEach(c => { const m = mk('c'); const i = mk('ci'); i.textContent = c; m.appendChild(i); w.appendChild(m); out.push(i); });
              w.style.overflow = 'visible'; w.style.padding = '0'; w.style.margin = '0';
            } else {
              const i = mk('wi'); i.textContent = tok; w.appendChild(i); out.push(i);
            }
            parent.appendChild(w);
          });
        } else if (ch.nodeType === 1) {
          if (ch.tagName === 'BR') { parent.appendChild(ch.cloneNode()); return; }
          const clone = ch.cloneNode(false); parent.appendChild(clone); walk(ch, clone);
        }
      });
    };
    const frag = document.createDocumentFragment();
    walk(el, frag);
    el.textContent = ''; el.appendChild(frag);
    return out;
  }

  function makeSparkles(container, n, o = {}) {
    if (!container) return [];
    const { min = 8, max = 24 } = o;
    const rnd = mulberry32(n * 97 + (container.id || 'x').length * 13);
    const NS = 'http://www.w3.org/2000/svg';
    const list = [];
    for (let i = 0; i < n; i++) {
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('class', 'sp'); s.setAttribute('aria-hidden', 'true');
      const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#spark'); s.appendChild(u);
      s.style.setProperty('--x', (rnd() * 96 + 2).toFixed(1) + '%');
      s.style.setProperty('--y', (rnd() * 88 + 4).toFixed(1) + '%');
      s.style.setProperty('--sz', (min + rnd() * (max - min)).toFixed(1) + 'px');
      s.dataset.speed = (0.25 + rnd() * 0.9).toFixed(2);
      container.appendChild(s); list.push(s);
    }
    return list;
  }

  /* ---------- Statut « ouvert / fermé » + horaires du jour ---------- */
  function initHours() {
    const chip = $('#status');
    const render = () => {
      const n = parisNow(); const mins = n.h * 60 + n.min; const h = SALON.horaires[n.dow];
      let txt = '', open = false;
      if (h) {
        const o = toMin(h[0]), c = toMin(h[1]);
        if (mins >= o && mins < c) { open = true; txt = `Ouvert · jusqu’à ${fmtH(c)}`; }
        else if (mins < o) txt = `Fermé · ouvre à ${fmtH(o)}`;
      }
      if (!txt) {
        for (let i = 1; i <= 7; i++) {
          const d = (n.dow + i) % 7, hh = SALON.horaires[d];
          if (hh) { txt = `Fermé · ouvre ${i === 1 ? 'demain' : JOURS[d]} à ${fmtH(toMin(hh[0]))}`; break; }
        }
      }
      if (chip) { chip.classList.toggle('is-closed', !open); chip.lastElementChild.textContent = txt; }
      $$('#hours tr').forEach(tr => tr.classList.toggle('is-today', +tr.dataset.d === n.dow));
    };
    render(); setInterval(render, 60000);
  }

  /* ---------- Boutons : le remplissage part du point d'entrée du curseur ---------- */
  function initBtnFill() {
    $$('.btn').forEach(b => {
      const set = e => { const r = b.getBoundingClientRect(); b.style.setProperty('--mx', (e.clientX - r.left) + 'px'); b.style.setProperty('--my', (e.clientY - r.top) + 'px'); };
      b.addEventListener('pointerenter', set); b.addEventListener('pointerleave', set);
    });
  }

  /* ---------- Menu mobile ---------- */
  const menu = { open: false };
  function initMenu() {
    const burger = $('#burger'), m = $('#menu');
    if (!burger || !m) return;
    const set = (open) => {
      menu.open = open;
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
      m.classList.toggle('is-open', open);
      m.setAttribute('aria-hidden', String(!open));
      if (open) m.removeAttribute('inert'); else m.setAttribute('inert', '');
      if (lenis) { open ? lenis.stop() : lenis.start(); } else document.body.style.overflow = open ? 'hidden' : '';
    };
    burger.addEventListener('click', () => set(!menu.open));
    $$('a', m).forEach(a => a.addEventListener('click', () => set(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.open) { set(false); burger.focus(); } });
    window.addEventListener('resize', () => { if (menu.open && innerWidth >= 980) set(false); });
  }

  /* ---------- Liens d'ancre (compatibles smooth scroll) ---------- */
  function initAnchors() {
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const target = id === '#top' ? document.body : $(id);
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(id === '#top' ? 0 : target, { duration: 1.6, easing: t => 1 - Math.pow(1 - t, 4) });
      else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', id);
    });
  }

  /* ---------- Lightbox de la galerie ---------- */
  function initLightbox() {
    const lb = $('#lb'); if (!lb) return;
    const items = $$('.tile [data-lb]');
    const img = $('#lbImg'), cap = $('#lbCap');
    let cur = 0, opener = null;
    const show = i => {
      cur = (i + items.length) % items.length;
      const el = items[cur], im = $('img', el);
      img.src = im.currentSrc || im.src; img.alt = im.alt;
      cap.textContent = $('figcaption', el.closest('.tile')).textContent;
    };
    const open = i => {
      opener = document.activeElement; show(i); lb.hidden = false;
      if (lenis) lenis.stop(); else document.body.style.overflow = 'hidden';
      $('#lbX').focus();
    };
    const close = () => {
      lb.hidden = true;
      if (lenis) lenis.start(); else document.body.style.overflow = '';
      if (opener) opener.focus();
    };
    items.forEach((b, i) => b.addEventListener('click', () => open(i)));
    $('#lbX').addEventListener('click', close);
    $('#lbPrev').addEventListener('click', () => show(cur - 1));
    $('#lbNext').addEventListener('click', () => show(cur + 1));
    lb.addEventListener('click', e => { if (e.target === lb || e.target.classList.contains('lb__fig')) close(); });
    document.addEventListener('keydown', e => {
      if (lb.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(cur - 1);
      else if (e.key === 'ArrowRight') show(cur + 1);
      else if (e.key === 'Tab') {
        const f = $$('button', lb); const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ---------- Carrousel d'avis (sans dépendance, glisser + flèches + auto) ---------- */
  function initReviews() {
    const vp = $('.rv__viewport'), track = $('#rvTrack'); if (!vp || !track) return;
    const slides = $$('.rv__slide', track), n = slides.length;
    const dotsEl = $('#rvDots');
    let idx = 0, timer = null, drag = null, userTouched = false;
    const dots = slides.map(() => { const i = document.createElement('i'); dotsEl.appendChild(i); return i; });
    track.style.position = 'relative';
    track.style.transition = 'transform 1s cubic-bezier(.22,1,.36,1)';
    const xFor = i => { const s = slides[i]; return -(s.offsetLeft - (vp.clientWidth - s.offsetWidth) / 2); };
    const go = (i, instant) => {
      idx = (i + n) % n;
      if (instant) track.style.transition = 'none';
      track.style.transform = `translate3d(${xFor(idx)}px,0,0)`;
      if (instant) { void track.offsetWidth; track.style.transition = 'transform 1s cubic-bezier(.22,1,.36,1)'; }
      slides.forEach((s, k) => { s.classList.toggle('is-active', k === idx); s.setAttribute('aria-hidden', k === idx ? 'false' : 'true'); });
      dots.forEach((d, k) => d.classList.toggle('is-on', k === idx));
    };
    const stop = () => { clearInterval(timer); timer = null; };
    const play = () => { if (reduce || userTouched || timer) return; timer = setInterval(() => { if (!document.hidden) go(idx + 1); }, 7000); };
    $('#rvPrev').addEventListener('click', () => { userTouched = true; stop(); go(idx - 1); });
    $('#rvNext').addEventListener('click', () => { userTouched = true; stop(); go(idx + 1); });
    $('#rv').addEventListener('mouseenter', stop);
    $('#rv').addEventListener('mouseleave', play);
    $('#rv').addEventListener('focusin', stop);

    vp.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = { x: e.clientX, base: xFor(idx), moved: false };
      vp.setPointerCapture(e.pointerId);
    });
    vp.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 6) { drag.moved = true; vp.classList.add('is-drag'); track.style.transition = 'none'; }
      if (drag.moved) track.style.transform = `translate3d(${drag.base + dx}px,0,0)`;
    });
    const end = e => {
      if (!drag) return;
      const dx = e.clientX - drag.x; const moved = drag.moved; drag = null;
      vp.classList.remove('is-drag'); track.style.transition = 'transform 1s cubic-bezier(.22,1,.36,1)';
      if (moved) { userTouched = true; stop(); go(Math.abs(dx) > 60 ? idx + (dx < 0 ? 1 : -1) : idx); }
    };
    vp.addEventListener('pointerup', end); vp.addEventListener('pointercancel', end);
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => go(idx, true), 120); });
    go(0, true);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => es.forEach(en => en.isIntersecting ? play() : stop()), { threshold: .25 }).observe($('#rv'));
    } else play();
    window.addEventListener('load', () => go(idx, true));
  }

  /* ---------- Réservation : demande prête à envoyer (e-mail, SMS, Instagram, .ics) ---------- */
  function initBooking() {
    const form = $('#bk'); if (!form) return;
    const cal = $('#cal'), slotsEl = $('#slots'), err = $('#bkErr'), prog = $('#bkProg'), done = $('#bkDone');
    const state = { service: '', date: '', time: '', flex: false };
    const fmtDateLong = iso => {
      const [y, m, d] = iso.split('-').map(Number);
      return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
    };
    const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

    function slotsFor(isoDate) {
      const [y, m, d] = isoDate.split('-').map(Number);
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      const h = SALON.horaires[dow]; if (!h) return [];
      const o = toMin(h[0]), c = toMin(h[1]) - SALON.dernierDepart;
      const now = parisNow(); const isToday = now.y === y && now.m === m && now.d === d;
      const minStart = isToday ? now.h * 60 + now.min + SALON.delaiJourMeme : 0;
      const out = [];
      for (let t = o; t <= c; t += SALON.pasCreneau) if (t >= minStart) out.push(t);
      return out;
    }

    /* Calendrier : de lundi de cette semaine à N semaines plus tard */
    const now = parisNow();
    const today = new Date(Date.UTC(now.y, now.m - 1, now.d));
    const start = new Date(today); start.setUTCDate(start.getUTCDate() - ((today.getUTCDay() + 6) % 7));
    ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].forEach(x => { const c = document.createElement('div'); c.className = 'cal__dow'; c.textContent = x; cal.appendChild(c); });
    const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    let lastDay = null;
    for (let i = 0; i < SALON.semaines * 7; i++) {
      const d = new Date(start); d.setUTCDate(start.getUTCDate() + i);
      const isoD = iso(d); const past = d < today;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cal__d';
      b.dataset.date = isoD;
      const first = d.getUTCDate() === 1 || i === 0;
      b.innerHTML = `${d.getUTCDate()}<small>${first ? MOIS[d.getUTCMonth()] : ''}</small>`;
      b.setAttribute('aria-label', fmtDateLong(isoD));
      b.setAttribute('aria-pressed', 'false');
      if (iso(d) === iso(today)) b.classList.add('is-today');
      if (past || !slotsFor(isoD).length) b.disabled = true; else lastDay = d;
      cal.appendChild(b);
    }
    if (lastDay) {
      const f = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
      const firstOpen = $('.cal__d:not(:disabled)', cal);
      if (firstOpen) { const [y, m, d] = firstOpen.dataset.date.split('-').map(Number); $('#bkRange').textContent = `du ${f.format(new Date(Date.UTC(y, m - 1, d)))} au ${f.format(lastDay)}`; }
    }

    const renderSlots = () => {
      slotsEl.innerHTML = '';
      if (!state.date) { slotsEl.innerHTML = '<p class="bk__hint">Choisissez d’abord un jour.</p>'; return; }
      const list = slotsFor(state.date);
      list.forEach(t => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'slot'; b.textContent = fmtH(t);
        b.dataset.t = `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
        b.setAttribute('aria-pressed', String(!state.flex && state.time === b.dataset.t));
        slotsEl.appendChild(b);
      });
      const f = document.createElement('button'); f.type = 'button'; f.className = 'slot slot--flex'; f.dataset.flex = '1';
      f.textContent = 'Je suis flexible sur l’horaire'; f.setAttribute('aria-pressed', String(state.flex));
      slotsEl.appendChild(f);
    };

    const progress = () => {
      const fd = new FormData(form);
      let k = 0;
      if (state.service) k++;
      if (state.date) k++;
      if (state.time || state.flex) k++;
      if (String(fd.get('prenom') || '').trim() && String(fd.get('tel') || '').trim()) k++;
      prog.style.transform = `scaleX(${k / 4})`;
    };

    form.addEventListener('change', e => {
      if (e.target.name === 'service') state.service = e.target.value;
      progress();
    });
    form.addEventListener('input', () => { progress(); err.textContent = ''; $$('[aria-invalid]', form).forEach(i => i.removeAttribute('aria-invalid')); });
    cal.addEventListener('click', e => {
      const b = e.target.closest('.cal__d'); if (!b || b.disabled) return;
      $$('.cal__d', cal).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      state.date = b.dataset.date; state.time = ''; state.flex = false; err.textContent = '';
      renderSlots(); progress();
    });
    slotsEl.addEventListener('click', e => {
      const b = e.target.closest('.slot'); if (!b) return;
      if (b.dataset.flex) { state.flex = !state.flex; state.time = ''; } else { state.time = b.dataset.t; state.flex = false; }
      $$('.slot', slotsEl).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.flex ? state.flex : (!state.flex && x.dataset.t === state.time))));
      err.textContent = ''; progress();
    });

    /* Les boutons « Réserver cette prestation » des cartes présélectionnent la prestation */
    $$('[data-service]').forEach(a => a.addEventListener('click', () => {
      const r = $$('input[name="service"]', form).find(i => i.value === a.dataset.service);
      if (r) { r.checked = true; state.service = r.value; progress(); }
    }));

    /* Prix (optionnels) : renseigner data-prix="35 €" sur une carte pour l'afficher */
    $$('.card[data-prix]').forEach(c => {
      const v = (c.dataset.prix || '').trim(); if (!v) return;
      const p = document.createElement('p'); p.className = 'card__prix'; p.textContent = `À partir de ${v}`;
      $('.card__body h3', c).insertAdjacentElement('afterend', p);
    });

    let message = '', subject = '', shortMsg = '';
    const buildMessage = () => {
      const fd = new FormData(form);
      const prenom = String(fd.get('prenom')).trim(), tel = String(fd.get('tel')).trim();
      const email = String(fd.get('email') || '').trim(), msg = String(fd.get('msg') || '').trim();
      const dateL = fmtDateLong(state.date);
      const heure = state.flex ? 'Je suis flexible sur l’horaire' : fmtH(toMin(state.time));
      subject = `Demande de rendez-vous : ${state.service}, ${dateL.replace(/ \d{4}$/, '')}${state.flex ? '' : ' à ' + fmtH(toMin(state.time))}`;
      const lines = [
        'Bonjour,', '',
        `Je souhaite prendre rendez-vous au salon « ${SALON.nom} ».`, '',
        `Prestation : ${state.service}`,
        `Jour souhaité : ${dateL}`,
        `Heure souhaitée : ${heure}`,
        `Prénom : ${prenom}`,
        `Téléphone : ${tel}`,
        email ? `E-mail : ${email}` : null,
        msg ? `Message : ${msg}` : null,
        '', 'Pouvez-vous me confirmer la disponibilité ? Merci beaucoup !'
      ].filter(x => x !== null);
      message = lines.join('\n');
      shortMsg = `Bonjour, demande de rdv « ${SALON.nom} » : ${state.service}, ${dateL.replace(/ \d{4}$/, '')}, ${state.flex ? 'horaire flexible' : fmtH(toMin(state.time))}. ${prenom}, ${tel}. Merci de me confirmer !`;
      return { prenom, tel, dateL, heure };
    };

    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      const prenom = form.elements.prenom, tel = form.elements.tel, email = form.elements.email;
      let msg = '', bad = null;
      if (!state.service) { msg = 'Choisissez une prestation (étape 1).'; bad = $('input[name="service"]', form); }
      else if (!state.date) { msg = 'Choisissez un jour (étape 2).'; bad = $('.cal__d:not(:disabled)', cal); }
      else if (!state.time && !state.flex) { msg = 'Choisissez une heure, ou « flexible » (étape 3).'; bad = $('.slot', slotsEl); }
      else if (!prenom.value.trim()) { msg = 'Indiquez votre prénom.'; bad = prenom; }
      else if (String(tel.value).replace(/\D/g, '').length < 10) { msg = 'Indiquez un numéro de téléphone valide (10 chiffres).'; bad = tel; }
      else if (email.value.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) { msg = 'Cette adresse e-mail semble incorrecte.'; bad = email; }
      if (msg) { err.textContent = msg; if (bad) { if (bad.matches('input,textarea')) bad.setAttribute('aria-invalid', 'true'); bad.focus({ preventScroll: false }); } return; }

      const s = buildMessage();
      $('#bkSum').textContent = `${state.service}\n${s.dateL}\n${s.heure}\n${s.prenom} · ${s.tel}`;
      const body = encodeURIComponent(message.replace(/\n/g, '\r\n'));
      $('#bkMail').href = `mailto:${SALON.email}?subject=${encodeURIComponent(subject)}&body=${body}`;
      $('#bkGmail').href = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(SALON.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      const sms = $('#bkSms');
      if (SALON.sms) { sms.hidden = false; sms.href = `sms:${SALON.sms}?&body=${encodeURIComponent(shortMsg)}`; } else sms.hidden = true;
      $('#bkOk').textContent = '';
      form.hidden = true; done.hidden = false;
      refreshLayout();
      done.focus({ preventScroll: true });
      const top = done.getBoundingClientRect().top + window.scrollY - 110;
      if (lenis) lenis.scrollTo(top, { duration: 1.1 }); else window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
    });

    const ok = t => { $('#bkOk').textContent = t; };
    const copy = async (txt) => {
      try { await navigator.clipboard.writeText(txt); return true; }
      catch (_) {
        const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); let r = false; try { r = document.execCommand('copy'); } catch (__) { }
        ta.remove(); return r;
      }
    };
    $('#bkCopy').addEventListener('click', async () => ok((await copy(message)) ? 'Message copié : collez-le où vous voulez (SMS, WhatsApp, e-mail…).' : 'Copie impossible : sélectionnez le texte ci-dessus.'));
    $('#bkIg').addEventListener('click', async () => {
      window.open(`https://ig.me/m/${SALON.instagram}`, '_blank', 'noopener');
      ok((await copy(message)) ? 'Message copié : collez-le dans la conversation Instagram du salon.' : 'Ouvrez Instagram et recopiez votre demande.');
    });
    $('#bkMail').addEventListener('click', () => ok('Votre application e-mail s’ouvre. Pas d’application ? Utilisez « Ouvrir dans Gmail » ou « Copier le message ».'));
    $('#bkIcs').addEventListener('click', () => {
      const [y, m, d] = state.date.split('-'); const t = state.flex ? '10:00' : state.time; const [hh, mm] = t.split(':').map(Number);
      const end = new Date(Date.UTC(+y, +m - 1, +d, hh + 1, mm));
      const esc = s => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
      const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Il etait une fois//Rendez-vous//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
        `UID:${Date.now()}@iletaitunefois`, `DTSTAMP:${stamp}`,
        `DTSTART:${y}${m}${d}T${pad(hh)}${pad(mm)}00`,
        `DTEND:${end.getUTCFullYear()}${pad(end.getUTCMonth() + 1)}${pad(end.getUTCDate())}T${pad(end.getUTCHours())}${pad(end.getUTCMinutes())}00`,
        `SUMMARY:${esc('Coiffure (à confirmer) – ' + SALON.nom)}`,
        `LOCATION:${esc(SALON.nom + ', ' + SALON.adresse)}`,
        `DESCRIPTION:${esc('Demande de rendez-vous à confirmer par le salon.\n' + state.service + '\nTéléphone du salon : ' + SALON.telAff)}`,
        'STATUS:TENTATIVE', 'END:VEVENT', 'END:VCALENDAR'];
      const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'rendez-vous-il-etait-une-fois.ics';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      ok('Fichier .ics téléchargé : ouvrez-le pour l’ajouter à votre agenda.');
    });
    $('#bkBack').addEventListener('click', () => { done.hidden = true; form.hidden = false; refreshLayout(); $('.bk__go', form).focus(); });
    progress();
  }

  /* ---------- Vidéos : lecture seulement quand elles sont visibles ---------- */
  function initVideos() {
    const vids = $$('video');
    if (reduce) { vids.forEach(v => { v.removeAttribute('autoplay'); v.pause(); }); return; }
    if (!('IntersectionObserver' in window)) { vids.forEach(v => v.play().catch(() => { })); return; }
    const io = new IntersectionObserver(es => es.forEach(en => {
      const v = en.target; if (en.isIntersecting) v.play().catch(() => { }); else v.pause();
    }), { threshold: .05 });
    vids.forEach(v => io.observe(v));
  }

  /* =====================================================================
     MOTION (GSAP + ScrollTrigger + Lenis)
     ===================================================================== */
  function initMotion() {
    root.classList.add('motion');
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    gsap.defaults({ ease: 'power3.out' });
    const mm = gsap.matchMedia();

    /* Smooth scroll */
    if (window.Lenis) {
      lenis = new Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
      lenis.stop();
    } else document.body.style.overflow = 'hidden';
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    /* Titres découpés */
    const heroChars = splitInto($('#heroTitle'), true);
    $$('[data-split]').forEach(h => {
      const words = splitInto(h, false);
      gsap.set(words, { yPercent: 115 });
      if (!h.hasAttribute('data-nothread') && !h.closest('.vband')) {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 300 22'); svg.setAttribute('class', 'thread'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('preserveAspectRatio', 'none');
        const p = document.createElementNS(ns, 'path'); p.setAttribute('d', 'M2 13 C 40 2, 72 22, 112 11 S 196 3, 236 13 S 284 19, 298 8'); p.setAttribute('pathLength', '1');
        svg.appendChild(p); h.appendChild(svg);
        gsap.set(p, { strokeDashoffset: 1 });
        ScrollTrigger.create({ trigger: h, start: 'top 84%', once: true, onEnter: () => gsap.to(p, { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut', delay: .5 }) });
      }
      ScrollTrigger.create({ trigger: h, start: 'top 86%', once: true, onEnter: () => gsap.to(words, { yPercent: 0, duration: 1.25, stagger: .07, ease: 'expo.out' }) });
    });

    /* Étincelles (fil rouge) */
    const heroSparks = makeSparkles($('#sparkles'), innerWidth < 700 ? 8 : 16, { min: 7, max: 26 });
    const figSparks = makeSparkles($('#figSparks'), innerWidth < 700 ? 8 : 18, { min: 8, max: 30 });
    gsap.set(heroSparks, { scale: 0 });

    /* États initiaux du hero */
    gsap.set(heroChars, { yPercent: 118, rotate: 6 });
    gsap.set('[data-hero-in]', { opacity: 0, y: 36 });
    gsap.set('[data-arch]', { opacity: 0 });
    gsap.set('.arch__mask', { yPercent: 14, scale: .94 });
    gsap.set('.hero__video', { scale: 1.28 });
    gsap.set('#nav', { yPercent: -120 });
    gsap.set('.progress i', { scaleX: 0 });

    function heroIntro() {
      const t = gsap.timeline();
      t.to('.hero__video', { scale: 1.06, duration: 2.6, ease: 'power2.out' }, 0)
        .to(heroChars, { yPercent: 0, rotate: 0, duration: 1.6, stagger: .045, ease: 'expo.out' }, .1)
        .to('[data-arch]', { opacity: 1, duration: 1.2 }, .3)
        .to('.arch__mask', { yPercent: 0, scale: 1, duration: 1.8, ease: 'expo.out' }, .3)
        .to('[data-hero-in]', { opacity: 1, y: 0, duration: 1.2, stagger: .13 }, .55)
        .to(heroSparks, { scale: 1, duration: 1.1, stagger: .05, ease: 'back.out(2.2)' }, .8)
        .to('#nav', { yPercent: 0, duration: 1.1, ease: 'expo.out' }, .7)
        .add(() => { if (lenis) lenis.start(); else document.body.style.overflow = ''; ScrollTrigger.refresh(); }, '-=.2');
      return t;
    }

    /* Loader : la couverture du livre s'ouvre */
    const loader = $('#loader');
    const lt = gsap.timeline({ defaults: { ease: 'expo.out' } });
    lt.from('.loader__kicker', { opacity: 0, y: 18, duration: .7 })
      .from('.loader__title i', { yPercent: 115, rotate: 5, duration: 1, stagger: .08 }, '-=.45')
      .to('.loader__thread path', { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut' }, '-=.8')
      .to('.loader__center', { opacity: 0, y: -24, duration: .45, ease: 'power2.in' }, '+=.1')
      .addLabel('open')
      .to('.loader__half--l', { xPercent: -101, duration: 1.2, ease: 'expo.inOut' }, 'open')
      .to('.loader__half--r', { xPercent: 101, duration: 1.2, ease: 'expo.inOut' }, 'open')
      .add(heroIntro, 'open+=.5')
      .add(() => loader.remove(), 'open+=1.3');
    setTimeout(() => { if (loader.isConnected) { loader.remove(); if (lenis) lenis.start(); else document.body.style.overflow = ''; } }, 9000);

    /* Barre de progression de lecture */
    gsap.to('.progress i', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: .3 } });

    /* Navigation : se cache en descendant, revient en remontant */
    const nav = $('#nav'); let navHidden = false;
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: self => {
        const y = self.scroll();
        nav.classList.toggle('is-solid', y > 60);
        const hide = y > 260 && self.direction === 1 && !menu.open;
        if (hide !== navHidden) { navHidden = hide; gsap.to(nav, { yPercent: hide ? -120 : 0, duration: .7, ease: 'expo.out', overwrite: 'auto' }); }
      }
    });
    /* Boutons flottants mobiles */
    const fab = $('#fab');
    ScrollTrigger.create({ trigger: '.hero', start: 'bottom 70%', end: 'max', onToggle: s => fab.classList.toggle('is-on', s.isActive) });
    ScrollTrigger.create({ trigger: '#reserver', start: 'top 60%', end: 'bottom 40%', onToggle: s => { if (s.isActive) fab.classList.remove('is-on'); else if (ScrollTrigger.positionInViewport) fab.classList.add('is-on'); } });

    /* Hero : parallax multicouche */
    const heroST = { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true };
    gsap.to('[data-hero-bg]', { yPercent: 14, ease: 'none', scrollTrigger: heroST });
    gsap.to('.hero__content', { y: -90, opacity: .15, ease: 'none', scrollTrigger: heroST });
    gsap.to('[data-arch]', { y: -140, ease: 'none', scrollTrigger: heroST });
    gsap.to('.arch__mask img', { yPercent: -9, ease: 'none', scrollTrigger: heroST });
    heroSparks.forEach(s => {
      const sp = +s.dataset.speed;
      gsap.to(s, { y: -sp * 320, ease: 'none', scrollTrigger: heroST });
      gsap.to(s, { yPercent: gsap.utils.random(-70, 70), rotation: gsap.utils.random(-90, 90), duration: gsap.utils.random(3, 6), repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 3 });
    });
    figSparks.forEach(s => {
      gsap.set(s, { opacity: gsap.utils.random(.2, .6) });
      gsap.to(s, { yPercent: gsap.utils.random(-120, 120), rotation: gsap.utils.random(-120, 120), duration: gsap.utils.random(4, 8), repeat: -1, yoyo: true, ease: 'sine.inOut' });
    });

    /* Bandeau défilant : vitesse et sens réagissent au scroll */
    const tweens = $$('.marquee__row').map(row => {
      const track = $('.marquee__track', row), group = $('.marquee__group', track);
      for (let i = 0; i < 3; i++) track.appendChild(group.cloneNode(true));
      const dir = +row.dataset.dir || -1;
      return gsap.fromTo(track, { xPercent: dir < 0 ? 0 : -25 }, { xPercent: dir < 0 ? -25 : 0, duration: 38, ease: 'none', repeat: -1 });
    });
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: self => {
        const boost = 1 + Math.min(Math.abs(self.getVelocity()) / 260, 7);
        const s = self.direction === 1 ? 1 : -1;
        tweens.forEach(tw => gsap.timeline().to(tw, { timeScale: s * boost, duration: .25, overwrite: true, ease: 'power2.out' }).to(tw, { timeScale: s, duration: 1.4, ease: 'power2.out' }, '+=.05'));
      }
    });

    /* Apparitions génériques */
    $$('[data-reveal]').forEach(el => gsap.from(el, { opacity: 0, y: 44, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true } }));

    /* Chiffres : compteurs, étoiles, filets */
    $$('[data-count]').forEach(el => {
      const end = parseFloat(el.dataset.count), dec = +el.dataset.dec || 0; const o = { v: 0 };
      const fmt = v => dec ? v.toFixed(dec).replace('.', ',') : String(Math.round(v));
      el.textContent = fmt(0);
      ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => gsap.to(o, { v: end, duration: 2.4, ease: 'power2.out', onUpdate: () => { el.textContent = fmt(o.v); } }) });
    });
    gsap.from('.stars svg', { scale: 0, rotate: -120, opacity: 0, stagger: .14, duration: 1, ease: 'back.out(2.6)', scrollTrigger: { trigger: '.stars', start: 'top 90%', once: true } });
    $$('.fig').forEach((f, i) => gsap.fromTo(f, { '--l': 0 }, { '--l': 1, duration: 1.6, delay: i * .12, ease: 'expo.out', scrollTrigger: { trigger: f, start: 'top 92%', once: true } }));
    gsap.from('.fig__n, .fig__l', { y: 50, opacity: 0, stagger: .08, duration: 1.2, scrollTrigger: { trigger: '.figures__grid', start: 'top 85%', once: true } });

    /* Galerie : rideau qui se lève + zoom doux */
    $$('.tile').forEach(t => {
      const c = $('.tile__curtain', t), b = $('.tile__btn', t);
      gsap.timeline({ scrollTrigger: { trigger: t, start: 'top 92%', once: true } })
        .to(c, { scaleY: 0, duration: 1.3, ease: 'expo.inOut' }, 0)
        .from(b, { scale: 1.3, duration: 1.8, ease: 'expo.out' }, 0);
    });

    /* Vidéo plein écran : le cercle s'agrandit */
    const clip = $('#vclip');
    gsap.set(clip, { clipPath: 'circle(3% at 50% 50%)' });
    gsap.to(clip, { clipPath: 'circle(80% at 50% 50%)', ease: 'none', scrollTrigger: { trigger: '.vband', start: 'top top', end: '+=130%', pin: '.vband__pin', scrub: .6, anticipatePin: 1, refreshPriority: 1 } });
    gsap.fromTo('.vband__clip video', { scale: 1.25 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.vband', start: 'top top', end: '+=130%', scrub: true } });

    /* Footer : grand nom qui monte lettre par lettre */
    const giant = $('#giant');
    if (giant) {
      const txt = giant.textContent; giant.textContent = '';
      const chars = Array.from(txt).map(ch => { const s = document.createElement('span'); s.className = 'gc'; s.innerHTML = ch === ' ' ? '&nbsp;' : ch; giant.appendChild(s); return s; });
      gsap.set(chars, { yPercent: 110 });
      ScrollTrigger.create({ trigger: giant, start: 'top 95%', once: true, onEnter: () => gsap.to(chars, { yPercent: 0, duration: 1.6, stagger: .05, ease: 'expo.out' }) });
    }

    /* Aimants + inclinaison 3D (souris uniquement) */
    if (finePointer) {
      $$('.mag').forEach(el => {
        const inner = $('.btn__t', el) || el.firstElementChild;
        const xTo = gsap.quickTo(el, 'x', { duration: .7, ease: 'power3' }), yTo = gsap.quickTo(el, 'y', { duration: .7, ease: 'power3' });
        const ixTo = inner ? gsap.quickTo(inner, 'x', { duration: .7, ease: 'power3' }) : null, iyTo = inner ? gsap.quickTo(inner, 'y', { duration: .7, ease: 'power3' }) : null;
        el.addEventListener('pointermove', e => {
          const r = el.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
          xTo(dx * .26); yTo(dy * .36); if (ixTo) { ixTo(dx * .1); iyTo(dy * .16); }
        });
        el.addEventListener('pointerleave', () => { xTo(0); yTo(0); if (ixTo) { ixTo(0); iyTo(0); } });
      });
      $$('.tilt').forEach(el => {
        const glare = $('.card__glare', el);
        gsap.set(el, { transformPerspective: 900 });
        const rx = gsap.quickTo(el, 'rotationX', { duration: .7, ease: 'power3' }), ry = gsap.quickTo(el, 'rotationY', { duration: .7, ease: 'power3' });
        el.addEventListener('pointermove', e => {
          const r = el.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
          ry(px * 11); rx(-py * 11);
          if (glare) gsap.set(glare, { x: e.clientX - r.left, y: e.clientY - r.top });
        });
        el.addEventListener('pointerleave', () => { rx(0); ry(0); });
      });
    }

    /* ----- Mise en scène bureau (≥ 980 px) : sections pinnées ----- */
    mm.add('(min-width: 980px)', () => {
      /* Histoire : section pinnée, 4 chapitres qui se transforment pendant le scroll */
      const story = $('.story'); story.classList.add('story--pinned');
      const frames = $$('.story__frame'), chs = $$('.chapter'), idx = $$('.story__idx span');
      gsap.set(chs.slice(1), { autoAlpha: 0, y: 50 });
      frames.forEach((f, i) => { if (i) { gsap.set(f, { yPercent: 101 }); gsap.set(f.firstElementChild, { yPercent: -101, scale: 1.25 }); } });
      const tl = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        scrollTrigger: {
          trigger: '#storyPin', start: 'top top', end: () => '+=' + Math.round(innerHeight * 3.6), pin: true, scrub: .8, anticipatePin: 1, invalidateOnRefresh: true, refreshPriority: 3,
          onUpdate: self => {
            const t = self.progress * 4, i = t < 1.45 ? 0 : t < 2.45 ? 1 : t < 3.45 ? 2 : 3;
            idx.forEach((s, k) => s.classList.toggle('is-on', k === i));
          }
        }
      });
      tl.to('.story__line i', { scaleY: 1, duration: 4, ease: 'none' }, 0);
      for (let i = 1; i < 4; i++) {
        tl.to(chs[i - 1], { autoAlpha: 0, y: -50, duration: .45, ease: 'power2.in' }, i)
          .fromTo(chs[i], { autoAlpha: 0, y: 50 }, { autoAlpha: 1, y: 0, duration: .6, ease: 'power2.out' }, i + .4)
          .to(frames[i], { yPercent: 0, duration: .95 }, i)
          .to(frames[i].firstElementChild, { yPercent: 0, scale: 1, duration: .95 }, i);
      }
      tl.to({}, { duration: .35 });

      /* Prestations : défilement horizontal piloté par le scroll vertical */
      const sec = $('.services'); sec.classList.add('services--pinned');
      const track = $('#servTrack'), pin = $('#servPin');
      const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
      const hz = gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: pin, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: .9, anticipatePin: 1, invalidateOnRefresh: true, refreshPriority: 2 } });
      $$('.card__photo img', track).forEach(img => gsap.fromTo(img, { xPercent: -5 }, { xPercent: 5, ease: 'none', scrollTrigger: { trigger: img.closest('.card'), containerAnimation: hz, start: 'left right', end: 'right left', scrub: true } }));
      const onFocus = e => {
        const el = e.target.closest('.card, .services__outro, .services__intro'); if (!el) return;
        const st = hz.scrollTrigger, d = dist(); if (!d) return;
        const p = Math.min(1, Math.max(0, (el.offsetLeft - 80) / d));
        const y = st.start + p * (st.end - st.start);
        if (lenis) lenis.scrollTo(y, { immediate: true }); else window.scrollTo(0, y);
      };
      track.addEventListener('focusin', onFocus);
      return () => { story.classList.remove('story--pinned'); sec.classList.remove('services--pinned'); track.removeEventListener('focusin', onFocus); };
    });

    window.addEventListener('load', () => ScrollTrigger.refresh());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  }

  /* Version sans animation (mouvement réduit, ou GSAP indisponible) */
  function initStatic() {
    const loader = $('#loader'); if (loader) loader.remove();
    makeSparkles($('#sparkles'), 8, { min: 7, max: 22 });
    makeSparkles($('#figSparks'), 8, { min: 8, max: 26 });
    const fab = $('#fab');
    if (fab && 'IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(en => fab.classList.toggle('is-on', !en.isIntersecting)), { threshold: 0 }).observe($('.hero'));
  }

  /* ---------- Démarrage ---------- */
  function init() {
    initHours(); initBtnFill(); initMenu(); initAnchors(); initLightbox(); initReviews(); initBooking(); initVideos();
    if (hasGSAP && !reduce) {
      try { initMotion(); } catch (e) { console.error(e); const l = $('#loader'); if (l) l.remove(); document.body.style.overflow = ''; }
    } else initStatic();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
