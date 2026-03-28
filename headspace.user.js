// ==UserScript==
// @name         Headspace
// @namespace    headspace
// @version      1.0
// @description  Customize character names and pronouns on fiction sites
// @match        https://www.literotica.com/s/*
// @match        https://archiveofourown.org/works/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://greasyfork.org/en/scripts/571470-headspace
// @license      MIT
// ==/UserScript==

/* jshint esversion: 11 */

(function () {
  'use strict';

  // =====================================================================
  //  SITE DETECTION
  // =====================================================================
  const SITE = location.hostname.includes('literotica.com') ? 'lit'
             : location.hostname.includes('archiveofourown.org') ? 'ao3'
             : null;
  if (!SITE) return;

  // =====================================================================
  //  CONSTANTS
  // =====================================================================
  const STORAGE_KEY = 'headspace_global';
  const STORAGE_KEY_FICS = 'headspace_fics';
  const COMPROMISE_URL = 'https://unpkg.com/compromise';

  // =====================================================================
  //  PRONOUN DATA
  // =====================================================================
  // Five cases: subject, object, possessive-determiner, possessive-pronoun, reflexive
  const PRONOUN_FULL = {
    he_him:    { subj: 'he',   obj: 'him',  det: 'his',   poss: 'his',    refl: 'himself' },
    she_her:   { subj: 'she',  obj: 'her',  det: 'her',   poss: 'hers',   refl: 'herself' },
    they_them: { subj: 'they', obj: 'them', det: 'their', poss: 'theirs', refl: 'themselves' },
  };

  // Top 10 most common neopronoun sets (subj/obj/det/poss/refl)
  const NEOPRONOUN_SETS = [
    { subj: 'ze',  obj: 'hir',  det: 'hir',  poss: 'hirs',  refl: 'hirself' },
    { subj: 'ze',  obj: 'zir',  det: 'zir',  poss: 'zirs',  refl: 'zirself' },
    { subj: 'xe',  obj: 'xem',  det: 'xyr',  poss: 'xyrs',  refl: 'xemself' },
    { subj: 'ey',  obj: 'em',   det: 'eir',  poss: 'eirs',  refl: 'emself' },
    { subj: 'fae', obj: 'faer', det: 'faer', poss: 'faers', refl: 'faerself' },
    { subj: 've',  obj: 'ver',  det: 'vis',  poss: 'vis',   refl: 'verself' },
    { subj: 'ae',  obj: 'aer',  det: 'aer',  poss: 'aers',  refl: 'aerself' },
    { subj: 'per', obj: 'per',  det: 'per',  poss: 'pers',  refl: 'perself' },
    { subj: 'e',   obj: 'em',   det: 'eir',  poss: 'eirs',  refl: 'emself' },
    { subj: 'co',  obj: 'co',   det: 'cos',  poss: 'cos',   refl: 'coself' },
  ];

  // Subject-verb agreement for they/them
  const VERB_AGREEMENT = {
    'was': 'were', 'is': 'are', 'has': 'have', 'does': 'do',
    "wasn't": "weren't", "isn't": "aren't", "hasn't": "haven't", "doesn't": "don't",
  };

  // Contraction suffixes to strip when matching pronouns
  const CONTRACTION_TAILS = ["'s", "\u2019s", "'d", "\u2019d", "'ll", "\u2019ll", "'ve", "\u2019ve"];

  // Perception & causative verbs: these take object + bare infinitive
  const _PERCEPTION_CAUSATIVE = new Set([
    'made', 'let', 'had', 'helped', 'watched', 'saw', 'heard', 'felt',
    'kept', 'found', 'noticed', 'observed', 'seen', 'watch', 'make',
    'help', 'find', 'keep', 'notice', 'observe', 'hear', 'see', 'feel',
  ]);

  // =====================================================================
  //  DEFAULT SETTINGS
  // =====================================================================
  function defaultSettings() {
    return {
      enabled: true,
      changePronouns: true,
      changeFrom: 'all_binary',
      customFrom: ['', '', ''],
      changeTo: 'she_her',
      customTo: ['', '', ''],
      changeNames: false,
      nameSwaps: [],
    };
  }

  // =====================================================================
  //  STORAGE HELPERS
  // =====================================================================
  function loadGlobal() {
    try { return Object.assign(defaultSettings(), JSON.parse(localStorage.getItem(STORAGE_KEY))); }
    catch { return defaultSettings(); }
  }
  function saveGlobal(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

  function loadAllFics() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_FICS)) || {}; }
    catch { return {}; }
  }
  function saveAllFics(f) { localStorage.setItem(STORAGE_KEY_FICS, JSON.stringify(f)); }

  function ficKey() {
    if (SITE === 'lit') {
      const m = location.pathname.match(/^\/s\/([^/?#]+)/);
      return m ? m[1] : null;
    }
    if (SITE === 'ao3') {
      const m = location.pathname.match(/^\/works\/(\d+)/);
      return m ? 'ao3_' + m[1] : null;
    }
    return null;
  }

  function hasFicSettings() {
    const key = ficKey();
    return key ? (key in loadAllFics()) : false;
  }

  function loadFic() {
    const key = ficKey();
    if (!key) return null;
    const all = loadAllFics();
    return all[key] ? Object.assign(defaultSettings(), all[key]) : null;
  }

  function saveFic(s) {
    const key = ficKey();
    if (!key) return;
    const all = loadAllFics();
    all[key] = s;
    saveAllFics(all);
  }

  function clearFic() {
    const key = ficKey();
    if (!key) return;
    const all = loadAllFics();
    delete all[key];
    saveAllFics(all);
  }

  function getActive() {
    return loadFic() || loadGlobal();
  }

  function loadForScope(scope) {
    if (scope === 'fic') {
      const fic = loadFic();
      if (fic) return fic;
      return Object.assign({}, loadGlobal());
    }
    return loadGlobal();
  }

  function saveForScope(scope, s) {
    if (scope === 'fic') saveFic(s);
    else saveGlobal(s);
  }

  // =====================================================================
  //  CASE MATCHING
  // =====================================================================
  function matchCase(original, replacement) {
    if (!replacement) return replacement;
    if (original === original.toUpperCase() && original.length > 1) return replacement.toUpperCase();
    if (original[0] === original[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
    return replacement.toLowerCase();
  }

  // =====================================================================
  //  PRONOUN SET BUILDERS
  // =====================================================================
  function getSourceSets(settings) {
    switch (settings.changeFrom) {
      case 'all_binary':
        return [PRONOUN_FULL.he_him, PRONOUN_FULL.she_her];
      case 'all':
        return [PRONOUN_FULL.he_him, PRONOUN_FULL.she_her, PRONOUN_FULL.they_them, ...NEOPRONOUN_SETS];
      case 'he_him':
        return [PRONOUN_FULL.he_him];
      case 'she_her':
        return [PRONOUN_FULL.she_her];
      case 'custom': {
        const c = settings.customFrom.map(s => (s || '').trim());
        if (c.some(Boolean)) return [{ subj: c[0], obj: c[1], det: c[2], poss: c[2], refl: '' }];
        return [];
      }
      default: return [];
    }
  }

  function getToSet(settings) {
    if (settings.changeTo === 'she_her') return PRONOUN_FULL.she_her;
    if (settings.changeTo === 'he_him') return PRONOUN_FULL.he_him;
    if (settings.changeTo === 'they_them') return PRONOUN_FULL.they_them;
    if (settings.changeTo === 'custom') {
      const c = settings.customTo.map(s => (s || '').trim());
      return { subj: c[0], obj: c[1], det: c[2], poss: c[2], refl: '' };
    }
    return null;
  }

  // =====================================================================
  //  CONTRACTION HANDLING
  // =====================================================================
  function stripContraction(text) {
    const lower = text.toLowerCase();
    for (const tail of CONTRACTION_TAILS) {
      if (lower.endsWith(tail)) {
        return { stem: text.slice(0, -tail.length), tail: text.slice(-tail.length) };
      }
    }
    return { stem: text, tail: '' };
  }

  // =====================================================================
  //  NLP REPLACEMENT ENGINE
  // =====================================================================
  /**
   * Disambiguation for ambiguous pronouns when mapping to they/them:
   *
   *   "her" → obj (them) OR det (their):
   *     "I saw her" → "I saw them"  |  "her dress" → "their dress"
   *
   *   "his" → det (their) OR poss (theirs):
   *     "his book" → "their book"  |  "the book was his" → "the book was theirs"
   *
   * compromise tags all of these as {Possessive, Pronoun} regardless of role,
   * so we use contextual rules:
   *
   *   1. CAUSATIVE RULE: perception/causative verb before pronoun → object
   *      "made her feel", "watched her leave", "let her go"
   *   2. GERUND RULE: [verb]ing + pronoun defaults to possessive-det, unless
   *      next word is adv/adj or the gerund is a perception verb
   *      "burying her head" → det  |  "watching her leave" → obj
   *   3. DEEP SCAN: scan past adj/adv chains to find a following noun → det
   *      "her soft, rather pale legs" → det
   *   4. ADJ+NOUN: 2-word lookahead for adjective then noun → det
   *      "her close friend" → det  |  "pulled her close" → obj
   *   5. VERB BEFORE + NO NOUN AFTER → object
   *   6. DEFAULT → object (most common in fiction prose)
   */
  function nlpReplace(text, settings, namePairs) {
    if (typeof nlp === 'undefined') return fallbackReplace(text, settings, namePairs);

    const toSet = settings.changePronouns ? getToSet(settings) : null;
    const doPronouns = settings.changePronouns && toSet;
    const doNames = settings.changeNames && namePairs.length > 0;
    if (!doPronouns && !doNames) return text;

    // Build pronoun lookup
    const pronounMap = {};
    if (doPronouns) {
      const fromSets = getSourceSets(settings);
      for (const set of fromSets) {
        const entries = [
          { word: set.subj, role: 'subj' },
          { word: set.obj,  role: 'obj' },
          { word: set.det,  role: 'det' },
          { word: set.poss, role: 'poss' },
          { word: set.refl, role: 'refl' },
        ];
        for (const { word, role } of entries) {
          if (!word) continue;
          const key = word.toLowerCase();
          if (key === (toSet[role] || '').toLowerCase()) continue;
          if (!pronounMap[key]) pronounMap[key] = { roles: new Set() };
          pronounMap[key].roles.add(role);
        }
      }
    }

    const nameMap = {};
    if (doNames) {
      for (const { from, to } of namePairs) nameMap[from.toLowerCase()] = to;
    }

    const needsVerbFix = doPronouns && settings.changeTo === 'they_them';

    const doc = nlp(text);
    const json = doc.json();

    let result = '';
    for (const sentence of json) {
      const terms = sentence.terms;
      for (let ti = 0; ti < terms.length; ti++) {
        const term = terms[ti];
        const tags = new Set(term.tags || []);
        let replaced = false;

        if (doPronouns && tags.has('Pronoun')) {
          const { stem, tail } = stripContraction(term.text);
          const stemLower = stem.toLowerCase();

          if (pronounMap[stemLower]) {
            const entry = pronounMap[stemLower];
            const roles = entry.roles;
            let role;

            if (roles.size === 1) {
              role = roles.values().next().value;
            } else {
              if (stemLower.endsWith('self') || stemLower.endsWith('selves')) {
                role = 'refl';
              } else {
                const prevTerm = ti > 0 ? terms[ti - 1] : null;
                const nextTerm = ti < terms.length - 1 ? terms[ti + 1] : null;
                const prevTags = prevTerm ? new Set(prevTerm.tags || []) : new Set();
                const nextTags = nextTerm ? new Set(nextTerm.tags || []) : new Set();

                const prevIsVerb = prevTags.has('Verb') || prevTags.has('Gerund') ||
                                   prevTags.has('PastTense') || prevTags.has('PresentTense') ||
                                   prevTags.has('Preposition') || prevTags.has('Conjunction') ||
                                   prevTags.has('Copula');
                const prevIsGerund = prevTags.has('Gerund');
                const prevText = (prevTerm?.text || '').toLowerCase();
                const nextIsNoun = nextTags.has('Noun');
                const nextIsAdj  = nextTags.has('Adjective');
                const nextIsAdv  = nextTags.has('Adverb');
                const nextIsDet  = nextTags.has('Determiner');
                const nextIsGerund = nextTags.has('Gerund');

                // Deep lookahead: scan past adj/adv chains to find a noun
                const deepNoun = (function() {
                  for (let j = ti + 1; j < Math.min(terms.length, ti + 6); j++) {
                    const jt = new Set(terms[j].tags || []);
                    if (jt.has('Noun')) return true;
                    if (!jt.has('Adjective') && !jt.has('Adverb') && !jt.has('Determiner')) return false;
                  }
                  return false;
                })();

                // 2-word lookahead for adj+noun
                const next2Term = ti < terms.length - 2 ? terms[ti + 2] : null;
                const next2Tags = next2Term ? new Set(next2Term.tags || []) : new Set();
                const adjThenNoun = nextIsAdj && next2Tags.has('Noun');

                const followedByNoun = nextIsNoun || nextIsDet || nextIsGerund || adjThenNoun || deepNoun;

                const PERCEPTION_CAUSATIVE = _PERCEPTION_CAUSATIVE;
                const prevIsCausative = PERCEPTION_CAUSATIVE.has(prevText);

                // CAUSATIVE RULE
                if (roles.has('obj') && prevIsCausative) {
                  role = 'obj';
                }
                // GERUND RULE
                else if (roles.has('det') && prevIsGerund) {
                  if (nextIsAdv || nextIsAdj) {
                    role = 'obj';
                  } else if (PERCEPTION_CAUSATIVE.has(prevText.replace(/ing$/, 'e')) ||
                             PERCEPTION_CAUSATIVE.has(prevText.replace(/ing$/, '')) ||
                             PERCEPTION_CAUSATIVE.has(prevText.replace(/ting$/, 't')) ||
                             PERCEPTION_CAUSATIVE.has(prevText.replace(/ping$/, 'p')) ||
                             PERCEPTION_CAUSATIVE.has(prevText.replace(/([a-z])\1ing$/, '$1'))) {
                    role = 'obj';
                  } else {
                    role = 'det';
                  }
                }
                // RULE 1: followed by noun → possessive det
                else if (roles.has('det') && followedByNoun) {
                  role = 'det';
                }
                // RULE 2: prev is verb-like, NOT followed by noun → object
                else if (roles.has('obj') && (prevIsVerb || !followedByNoun)) {
                  role = 'obj';
                }
                // RULE 3: standalone possessive
                else if (roles.has('poss') && !followedByNoun) {
                  role = 'poss';
                }
                // RULE 4: default to object
                else if (roles.has('obj')) {
                  role = 'obj';
                }
                else if (roles.has('subj')) {
                  role = 'subj';
                }
                else {
                  role = roles.values().next().value;
                }
              }
            }

            const replacement = toSet[role];
            if (replacement && stemLower !== replacement.toLowerCase()) {
              const casedStem = matchCase(stem, replacement);
              result += term.pre + casedStem + tail + term.post;
              replaced = true;

              // Subject-verb agreement for they/them
              if (needsVerbFix && role === 'subj' && !tail && ti < terms.length - 1) {
                const next = terms[ti + 1];
                const nextLower = next.text.toLowerCase();
                if (VERB_AGREEMENT[nextLower]) {
                  ti++;
                  result += next.pre + matchCase(next.text, VERB_AGREEMENT[nextLower]) + next.post;
                }
              }
            }
          }
        }

        if (!replaced && doNames) {
          const { stem: nameStem, tail: nameTail } = stripContraction(term.text);
          const nameLower = nameStem.toLowerCase();
          if (nameMap[nameLower]) {
            result += term.pre + matchCase(nameStem, nameMap[nameLower]) + nameTail + term.post;
            replaced = true;
          }
        }

        if (!replaced) {
          result += term.pre + term.text + term.post;
        }
      }
    }

    return result;
  }

  function fallbackReplace(text, settings, namePairs) {
    const toSet = settings.changePronouns ? getToSet(settings) : null;
    const pairs = [];

    if (settings.changePronouns && toSet) {
      const fromSets = getSourceSets(settings);
      for (const set of fromSets) {
        for (const role of ['subj', 'obj', 'det', 'poss', 'refl']) {
          if (set[role] && toSet[role] && set[role].toLowerCase() !== toSet[role].toLowerCase()) {
            pairs.push({ from: set[role], to: toSet[role] });
          }
        }
      }
    }
    if (settings.changeNames) {
      for (const n of namePairs) pairs.push(n);
    }
    if (!pairs.length) return text;

    const seen = new Set();
    const deduped = [];
    for (const p of pairs) { const k = p.from.toLowerCase(); if (!seen.has(k)) { seen.add(k); deduped.push(p); } }

    const sorted = deduped.sort((a, b) => b.from.length - a.from.length);
    const pattern = sorted.map(p => '\\b' + p.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').join('|');
    const regex = new RegExp(pattern, 'gi');
    const lookup = {};
    for (const p of sorted) lookup[p.from.toLowerCase()] = p.to;

    return text.replace(regex, m => { const r = lookup[m.toLowerCase()]; return r ? matchCase(m, r) : m; });
  }

  // =====================================================================
  //  DOM APPLICATION (shared)
  // =====================================================================
  function getStoryTargets() {
    if (SITE === 'lit') {
      let t = document.querySelectorAll('div[class*="aa_ht"] p');
      if (!t.length) t = document.querySelectorAll('.panel.article p');
      if (!t.length) t = document.querySelectorAll('div[class*="reading"] p, div[class*="content"] p');
      return t;
    }
    if (SITE === 'ao3') {
      let t = document.querySelectorAll('#workskin .userstuff p');
      if (!t.length) t = document.querySelectorAll('.userstuff p');
      return t;
    }
    return [];
  }

  function applyReplacements() {
    const settings = getActive();
    if (!settings.enabled || (!settings.changePronouns && !settings.changeNames)) { restoreOriginals(); return; }

    const namePairs = (settings.nameSwaps || [])
      .filter(n => n.from && n.from.trim() && n.to && n.to.trim())
      .map(n => ({ from: n.from.trim(), to: n.to.trim() }))
      .filter(n => n.from.toLowerCase() !== n.to.toLowerCase());

    const targets = getStoryTargets();
    targets.forEach(el => {
      if (!el.dataset.hsOriginal) el.dataset.hsOriginal = el.innerHTML;
      el.innerHTML = replaceInHTML(el.dataset.hsOriginal, settings, namePairs);
    });
  }

  function restoreOriginals() {
    document.querySelectorAll('[data-hs-original]').forEach(el => { el.innerHTML = el.dataset.hsOriginal; });
  }

  function replaceInHTML(html, settings, namePairs) {
    return html.replace(/(<[^>]*>)|([^<]+)/g, (m, tag, text) => tag ? tag : nlpReplace(text, settings, namePairs));
  }

  // =====================================================================
  //  LOAD COMPROMISE
  // =====================================================================
  function loadCompromise() {
    return new Promise((resolve) => {
      if (typeof nlp !== 'undefined') { resolve(); return; }
      const script = document.createElement('script');
      script.src = COMPROMISE_URL;
      script.onload = () => { console.log('[headspace] compromise loaded'); resolve(); };
      script.onerror = () => { console.warn('[headspace] compromise failed, using regex fallback'); resolve(); };
      document.head.appendChild(script);
    });
  }

  // Exposed by AO3 adapter for Cancel button
  let closeAO3Dialog = null;

  // =====================================================================
  //  SHARED SETTINGS HTML BUILDER
  // =====================================================================
  let currentScope = hasFicSettings() ? 'fic' : 'global';

  // Working copy: edited in-memory, only persisted on Apply/Save.
  // Initialized from storage; reset actions replace it.
  let workingSettings = loadForScope(currentScope);

  // Dirty = working copy differs from what's currently applied to the page.
  // Starts true so the first Apply works on page load.
  let isDirty = true;

  function markClean() { isDirty = false; }

  function markDirtyAndUpdate(panel) {
    isDirty = true;
    const applyBtn = panel.querySelector('#hs-apply');
    if (applyBtn) applyBtn.disabled = false;
  }

  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  function buildSettingsHTML(opts) {
    const s = workingSettings;
    const isAO3 = opts?.ao3;

    // Use site-appropriate button classes
    const btnPrimary = isAO3 ? 'class="button"' : 'class="button__small button--brand"';
    const btnSecondary = isAO3 ? 'class="button"' : 'class="button__small button__small--secondary"';

    const fromOpts = [
      ['all_binary', 'All binary pronouns'],
      ['all', 'All pronouns'],
      ['he_him', 'He/him/his'],
      ['she_her', 'She/her/hers'],
      ['custom', 'Custom'],
    ];
    const toOpts = [
      ['she_her', 'She/her/hers'],
      ['he_him', 'He/him/his'],
      ['they_them', 'They/them/theirs'],
      ['custom', 'Custom'],
    ];

    function sel(name, options, selected) {
      let h = `<select data-hs-sel="${name}">`;
      for (const [val, label] of options) h += `<option value="${val}" ${selected === val ? 'selected' : ''}>${label}</option>`;
      return h + '</select>';
    }

    let h = '';

    if (!isAO3) {
      h += '<div class="hs-heading">Headspace</div>';
    }

    // --- Scope toggle ---
    const activeClass = isAO3 ? 'hs-scope-active' : 'hs-scope-active';
    const globalDisabled = (currentScope === 'fic' && hasFicSettings()) ? 'disabled' : '';
    h += `<div class="${isAO3 ? 'hs-scope-group' : 'hs-scope-group'}">
      <button data-hs-scope="global" class="${currentScope === 'global' ? activeClass : ''}" ${globalDisabled}>All fics</button>
      <button data-hs-scope="fic" class="${currentScope === 'fic' ? activeClass : ''}">This fic</button>
    </div>`;

    // --- Enabled checkbox ---
    const enabledClass = isAO3 ? 'checkbox-label' : 'hs-section-toggle';
    h += `<label class="${enabledClass}"><input type="checkbox" id="hs-enabled" ${s.enabled ? 'checked' : ''}> Enabled</label>`;

    // --- Settings (hidden when disabled) ---
    h += `<div id="hs-settings-body" style="display:${s.enabled ? 'block' : 'none'}">`;

    // --- Pronouns ---
    const cbClass = isAO3 ? 'checkbox-label' : 'hs-section-toggle';
    h += `<label class="${cbClass}"><input type="checkbox" data-hs-section="pronouns" ${s.changePronouns ? 'checked' : ''}> Change pronouns</label>`;
    h += `<div class="${isAO3 ? 'subsettings' : 'hs-section-body'}" data-hs-body="pronouns" style="display:${s.changePronouns ? 'block' : 'none'}">`;
    h += `<label class="${isAO3 ? 'setting-label' : 'hs-title'}">From</label>`;
    h += sel('from', fromOpts, s.changeFrom);
    h += `<div class="${isAO3 ? 'hs-custom-row' : 'hs-custom-row'}" data-hs-toggle="from" style="display:${s.changeFrom === 'custom' ? 'flex' : 'none'}">
      <input type="text" placeholder="subj" value="${esc(s.customFrom[0])}" data-hs-cf="0">
      <input type="text" placeholder="obj"  value="${esc(s.customFrom[1])}" data-hs-cf="1">
      <input type="text" placeholder="poss" value="${esc(s.customFrom[2])}" data-hs-cf="2">
    </div>`;
    h += `<label class="${isAO3 ? 'setting-label' : 'hs-title'}">To</label>`;
    h += sel('to', toOpts, s.changeTo);
    h += `<div class="${isAO3 ? 'hs-custom-row' : 'hs-custom-row'}" data-hs-toggle="to" style="display:${s.changeTo === 'custom' ? 'flex' : 'none'}">
      <input type="text" placeholder="subj" value="${esc(s.customTo[0])}" data-hs-ct="0">
      <input type="text" placeholder="obj"  value="${esc(s.customTo[1])}" data-hs-ct="1">
      <input type="text" placeholder="poss" value="${esc(s.customTo[2])}" data-hs-ct="2">
    </div>`;
    h += '</div>';

    // --- Names ---
    h += `<label class="${cbClass}" style="margin-top:15px"><input type="checkbox" data-hs-section="names" ${s.changeNames ? 'checked' : ''}> Change names</label>`;
    h += `<div class="${isAO3 ? 'subsettings' : 'hs-section-body'}" data-hs-body="names" style="display:${s.changeNames ? 'block' : 'none'}">`;
    h += '<div id="hs-name-swaps">';
    const swaps = s.nameSwaps || [];
    for (let i = 0; i < swaps.length; i++) {
      h += `<div class="${isAO3 ? 'hs-name-row' : 'hs-name-row'}" data-hs-swap="${i}">
        <input type="text" placeholder="Old" value="${esc(swaps[i].from)}" data-field="from">
        <span>\u2192</span>
        <input type="text" placeholder="New" value="${esc(swaps[i].to)}" data-field="to">
        <button class="${isAO3 ? 'button hs-btn-remove' : 'hs-btn-inline hs-btn-remove'}" data-hs-remove="${i}">\u2715</button>
      </div>`;
    }
    h += '</div>';
    h += `<button class="${isAO3 ? 'button' : 'button__small--secondary hs-btn-inline hs-btn-add'}" id="hs-add-name" style="margin-top:${swaps.length ? '10' : '0'}px">+ Add name</button>`;
    h += '</div>';

    // Close the settings body wrapper
    h += '</div>';

    // --- Buttons ---
    if (isAO3) {
      h += `<div class="button-group" style="margin-top:15px">`;
      h += `<input type="submit" class="button" id="hs-apply" value="Save" ${isDirty ? '' : 'disabled'}>`;
      h += '</div>';
      h += '<div class="reset-link">';
      if (currentScope === 'global') {
        h += '<a href="#" id="hs-reset-defaults">Reset to default settings</a>';
      }
      if (currentScope === 'fic') {
        h += '<a href="#" id="hs-reset-fic">Clear customizations</a>';
      }
      h += '</div>';
    } else {
      h += `<div class="hs-btn-group" style="margin-top:15px">`;
      h += `<input type="submit" ${btnPrimary} id="hs-apply" value="Apply" ${isDirty ? '' : 'disabled'}>`;
      if (currentScope === 'global') {
        h += `<input type="submit" ${btnSecondary} id="hs-reset-defaults" value="Reset to defaults">`;
      }
      if (currentScope === 'fic') {
        h += `<input type="submit" ${btnSecondary} id="hs-reset-fic" value="Clear customizations">`;
      }
      h += '</div>';
    }

    h += `<div class="${isAO3 ? 'donate-link' : 'hs-status'}">Love it? <a href="https://buymeacoffee.com/spindrift" target="_blank" rel="noopener">Donate!</a></div>`;

    return h;
  }

  // =====================================================================
  //  SHARED EVENT BINDING
  // =====================================================================
  function bindPanelEvents(panel, renderFn) {
    const dirtyInput = () => markDirtyAndUpdate(panel);

    // Scope toggle (All fics / This fic)
    panel.querySelectorAll('[data-hs-scope]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const newScope = btn.dataset.hsScope;
        if (newScope === currentScope) return;
        currentScope = newScope;
        // Load the appropriate settings for the new scope into working copy
        workingSettings = loadForScope(currentScope);
        // Don't mark dirty — we haven't changed anything, just switched view
        renderFn();
      });
    });

    // Enabled checkbox
    panel.querySelector('#hs-enabled')?.addEventListener('change', (e) => {
      workingSettings.enabled = e.target.checked;
      const body = panel.querySelector('#hs-settings-body');
      if (body) body.style.display = workingSettings.enabled ? 'block' : 'none';
      if (!workingSettings.enabled) restoreOriginals();
      dirtyInput();
    });

    // Section toggles
    panel.querySelectorAll('[data-hs-section]').forEach(cb => {
      cb.addEventListener('change', () => {
        const section = cb.dataset.hsSection;
        const body = panel.querySelector(`[data-hs-body="${section}"]`);
        if (body) body.style.display = cb.checked ? 'block' : 'none';
        if (section === 'pronouns') workingSettings.changePronouns = cb.checked;
        if (section === 'names') workingSettings.changeNames = cb.checked;
        dirtyInput();
      });
    });

    // Dropdowns
    panel.querySelectorAll('[data-hs-sel]').forEach(sel => {
      sel.addEventListener('change', () => {
        const name = sel.dataset.hsSel;
        const val = sel.value;
        const row = panel.querySelector(`[data-hs-toggle="${name}"]`);
        if (row) row.style.display = val === 'custom' ? 'flex' : 'none';
        if (name === 'from') workingSettings.changeFrom = val;
        if (name === 'to') workingSettings.changeTo = val;
        dirtyInput();
      });
    });

    // Custom inputs
    panel.querySelectorAll('[data-hs-cf]').forEach(inp => {
      inp.addEventListener('input', () => { workingSettings.customFrom[+inp.dataset.hsCf] = inp.value; dirtyInput(); });
    });
    panel.querySelectorAll('[data-hs-ct]').forEach(inp => {
      inp.addEventListener('input', () => { workingSettings.customTo[+inp.dataset.hsCt] = inp.value; dirtyInput(); });
    });

    // Name swaps
    const sc = panel.querySelector('#hs-name-swaps');
    if (sc) {
      sc.addEventListener('input', (e) => {
        const row = e.target.closest('[data-hs-swap]');
        if (!row || e.target.tagName !== 'INPUT') return;
        const idx = +row.dataset.hsSwap;
        if (workingSettings.nameSwaps[idx]) { workingSettings.nameSwaps[idx][e.target.dataset.field] = e.target.value; dirtyInput(); }
      });
      sc.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-hs-remove]');
        if (!btn) return;
        workingSettings.nameSwaps.splice(+btn.dataset.hsRemove, 1);
        isDirty = true;
        renderFn();
      });
    }

    panel.querySelector('#hs-add-name')?.addEventListener('click', () => {
      workingSettings.nameSwaps.push({ from: '', to: '' });
      isDirty = true;
      renderFn();
    });

    // Apply / Save — persist working copy to storage and apply to page
    panel.querySelector('#hs-apply')?.addEventListener('click', (e) => {
      e.preventDefault();
      saveForScope(currentScope, workingSettings);
      applyReplacements();
      markClean();
      if (SITE === 'ao3' && closeAO3Dialog) {
        closeAO3Dialog();
      } else {
        renderFn();
      }
    });

    // Close button (AO3 dialog)
    panel.querySelector('#hs-close')?.addEventListener('click', (e) => {
      e.preventDefault();
      // Discard unsaved changes by reloading from storage
      workingSettings = loadForScope(currentScope);
      isDirty = false;
      if (closeAO3Dialog) closeAO3Dialog();
    });

    // Reset to defaults — reset storage, reload working copy
    panel.querySelector('#hs-reset-defaults')?.addEventListener('click', (e) => {
      e.preventDefault();
      saveGlobal(defaultSettings());
      workingSettings = defaultSettings();
      restoreOriginals();
      isDirty = true;
      renderFn();
    });

    // Clear fic customizations — delete fic storage, switch to global
    panel.querySelector('#hs-reset-fic')?.addEventListener('click', (e) => {
      e.preventDefault();
      clearFic();
      currentScope = 'global';
      workingSettings = loadGlobal();
      restoreOriginals();
      isDirty = true;
      renderFn();
    });
  }

  // =====================================================================
  //  LITEROTICA ADAPTER
  // =====================================================================
  function initLiterotica() {
    const TAB_ID = 'tab__headspace';
    const TAB_DATA = 'tabpanel-headspace';
    let settingsPane = null;

    function injectStyles() {
      const style = document.createElement('style');
      style.textContent = `
        /* :has() tab integration */
        ._widget__tab_1n1dq_51:has(._tab__list_1n1dq_51 input[id="${TAB_ID}"]:checked)
          ._tab__pane_1n1dq_875[data-tab="${TAB_DATA}"] {
          display: block !important;
          background-color: rgb(255, 255, 255);
          padding: 10px 5px;
          width: 200px;
        }
        .dark_theme ._widget__tab_1n1dq_51:has(._tab__list_1n1dq_51 input[id="${TAB_ID}"]:checked)
          ._tab__pane_1n1dq_875[data-tab="${TAB_DATA}"] {
          background-color: rgb(16, 16, 16);
        }
        ._widget__tab_1n1dq_51:has(._tab__list_1n1dq_51 input[id="mobile_${TAB_ID}"]:checked)
          ._tab__pane_1n1dq_875[data-tab="${TAB_DATA}"] {
          display: block !important;
          background-color: rgb(255, 255, 255);
          padding: 10px 5px;
          width: 200px;
        }
        .dark_theme ._widget__tab_1n1dq_51:has(._tab__list_1n1dq_51 input[id="mobile_${TAB_ID}"]:checked)
          ._tab__pane_1n1dq_875[data-tab="${TAB_DATA}"] {
          background-color: rgb(16, 16, 16);
        }

        .hs-icon-symbol { font-style: normal; font-size: 18px; font-weight: bold; line-height: 1; vertical-align: middle; position: relative; top: -5px; }
        .hs-panel { padding: 2px 0; font-family: inherit; font-size: inherit; color: inherit; }
        .hs-heading { margin: 0 0 8px; font-size: 13px; font-weight: 600; letter-spacing: .03em; opacity: .7; }
        .hs-scope-group { display: flex; margin-bottom: 12px; border: 1px solid rgba(128,128,128,.3); border-radius: 4px; overflow: hidden; }
        .hs-scope-group button { flex: 1; padding: 5px 0; font-family: inherit; border: none; background: transparent; color: inherit; cursor: pointer; transition: background .15s; font-weight: 400; }
        .hs-scope-group button.hs-scope-active { background: rgba(128,128,128,.2); }
        .hs-scope-group button:not(:last-child) { border-right: 1px solid rgba(128,128,128,.3); border-radius: 4px 0px 0px 4px !important; }
        .hs-scope-group button:last-child { border-radius: 0px 4px 4px 0px !important; }
        .hs-scope-group button:disabled { opacity: .4; cursor: not-allowed; }
        .hs-section-toggle { display: flex; align-items: center; gap: 5px; cursor: pointer; margin: 20px 0px; }
        .hs-section-toggle input { accent-color: rgb(74, 137, 243); margin: 0; }
        .hs-section-body { margin-left: 0; margin-bottom: 6px; }
        .hs-panel .hs-title { display: block; margin: 6px 0 2px; color: inherit; }
        .hs-panel select { width: 100%; padding: 5px 10px; font-size: 14px; border: 1px solid rgba(128,128,128,.3); border-radius: 3px; background: transparent; color: inherit; font-family: inherit; margin-bottom: 8px; cursor: pointer; -webkit-appearance: auto; appearance: auto; }
        .hs-custom-row { display: flex; gap: 3px; margin: 0 0 8px; }
        .hs-custom-row input[type="text"], .hs-name-row input[type="text"] { flex: 1; padding: 4px 6px; font-size: 12px; border: 1px solid rgba(128,128,128,.3); border-radius: 3px; background: transparent; color: inherit; font-family: inherit; min-width: 0; }
        .hs-custom-row input::placeholder, .hs-name-row input::placeholder { opacity: .8; font-style: italic; }
        .hs-divider { border: none; border-top: 1px solid rgba(128,128,128,.15); margin: 10px 0; }
        .hs-name-row { display: flex; gap: 3px; align-items: center; margin: 3px 0; }
        .hs-name-row span { opacity: .5; flex-shrink: 0; }
        .hs-btn-inline { display: inline-flex; align-items: center; justify-content: center; border: 1px solid rgba(128,128,128,.3); background: transparent; color: inherit; border-radius: 3px; cursor: pointer; padding: 1px 6px; font-family: inherit; }
        .hs-btn-inline:hover { opacity: .7; }
        .hs-btn-remove { color: #e53935; border-color: #e53935; padding: 1px 4px; font-size: 10px; margin-left: 5px; }
        .hs-btn-add { margin-top: 0px; }
        .hs-section-body:has(.hs-name-row) .hs-btn-add { margin-top: 10px; }
        .hs-status { font-size: 14px; text-align: center; margin-top: 15px; }
        .hs-panel.hs-disabled .hs-section-toggle, .hs-panel.hs-disabled .hs-section-body, .hs-panel.hs-disabled select { opacity: .35; pointer-events: none; }
        .hs-panel .hs-btn-group { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; }
        .hs-panel .button--brand[disabled] { opacity: .4; cursor: not-allowed; pointer-events: none; }
      `;
      document.head.appendChild(style);
    }

    function renderPanel() {
      if (!settingsPane) return;
      settingsPane.innerHTML = '<div class="hs-panel">' + buildSettingsHTML() + '</div>';
      bindPanelEvents(settingsPane, renderPanel);
    }

    function injectTab() {
      const tabNav = document.querySelector('ul._tab__list_1n1dq_51._tab__list__nav_1n1dq_1069');
      if (!tabNav) { console.warn('[headspace] Tab nav not found'); return; }

      const li = document.createElement('li');
      li.innerHTML = `
        <input type="radio" id="${TAB_ID}" name="panel-tabs" class="_tab_radio_1n1dq_1308">
        <label for="${TAB_ID}" class="_tab_radio_label_1n1dq_1385">
          <span class="_tab__item_1n1dq_58">
            <span class="_tab__link_1n1dq_61" title="Headspace">
              <i class="hs-icon-symbol">\u26A7</i>
            </span>
          </span>
        </label>`;
      tabNav.appendChild(li);

      const tabContent = document.querySelector('div._tab__content_1n1dq_875');
      if (!tabContent) { console.warn('[headspace] Tab content not found'); return; }

      settingsPane = document.createElement('div');
      settingsPane.dataset.tab = TAB_DATA;
      settingsPane.setAttribute('role', 'tabpanel');
      settingsPane.className = '_tab__pane_1n1dq_875';
      tabContent.appendChild(settingsPane);

      renderPanel();
    }

    injectStyles();
    injectTab();
    return { renderPanel };
  }

  // =====================================================================
  //  AO3 ADAPTER
  // =====================================================================
  function initAO3() {
    let dialog = null;
    let overlay = null;

    function injectStyles() {
      const style = document.createElement('style');
      style.textContent = `
        /* AO3 Headspace Dialog — reuses ao3-menu-dialog patterns */
        .hs-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; }
        .hs-dialog {
          position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
          background: rgb(255,255,255); padding: 20px;
          border: 10px solid rgb(238,238,238); border-radius: 0;
          box-shadow: rgba(0,0,0,0.2) 0 0 8px 0;
          z-index: 10000; width: 90%; max-width: 500px; max-height: 80vh;
          overflow-y: auto; font-family: inherit; font-size: inherit;
          color: rgb(42,42,42); box-sizing: border-box;
        }
        @media (max-width: 768px) {
          .hs-dialog { width: 96% !important; max-width: 96% !important; max-height: calc(100vh - 120px) !important; padding: 15px !important; }
        }
        .hs-dialog h3 { text-align: center; margin-top: 0; color: inherit; font-family: inherit; }
        .hs-settings {
          background: rgb(221,221,221); border: 2px solid rgb(243,239,236);
          padding: 15px; margin-bottom: 15px;
          box-shadow: rgb(153,153,153) 1px 0 5px 0 inset;
        }
        .hs-settings .setting-label { display: block; margin-bottom: 6px; font-weight: bold; color: inherit; opacity: 0.9; }
        .hs-settings .checkbox-label { display: block; font-weight: normal; color: inherit; margin-bottom: 8px; cursor: pointer; }
        .hs-settings .subsettings { padding-left: 20px; margin-top: 10px; }
        .hs-settings input[type="text"], .hs-settings select {
          width: 100%; box-sizing: border-box; padding: 4px 8px;
          background: rgb(255,255,255); border: 1px solid rgb(187,187,187);
          border-radius: 0; color: rgb(0,0,0); margin-bottom: 8px;
        }
        .hs-settings select { cursor: pointer; }
        .hs-settings input::placeholder { opacity: 0.6 !important; }
        .hs-settings .button-group { display: flex; justify-content: space-between; gap: 10px; margin-top: 15px; }
        .hs-settings .button-group input[type="submit"] { flex: 1; padding: 8px; }
        .hs-settings .reset-link { text-align: center; margin-top: 10px; font-size: 0.9em; color: inherit; opacity: 0.8; }
        .hs-settings .donate-link { text-align: center; margin-top: 15px; font-size: 0.8em; color: inherit; opacity: 0.8; }
        .hs-scope-group { display: flex; margin-bottom: 12px; border: 1px solid rgb(187,187,187); border-radius: 4px; overflow: hidden; }
        .hs-scope-group button { flex: 1; padding: 6px 0; font-family: inherit; border: none; background: transparent; color: inherit; cursor: pointer; font-weight: normal; }
        .hs-scope-group button.hs-scope-active { background: rgba(0,0,0,0.1); font-weight: bold; }
        .hs-scope-group button:not(:last-child) { border-right: 1px solid rgb(187,187,187); border-radius: 4px 0px 0px 4px; }
        .hs-scope-group button:last-child { border-radius: 0px 4px 4px 0px; }
        .hs-scope-group button:disabled { opacity: .4; cursor: not-allowed; }
        .hs-custom-row { display: flex; gap: 4px; margin: 0 0 8px; }
        .hs-custom-row input[type="text"] { flex: 1; min-width: 0; }
        .hs-name-row { display: flex; gap: 4px; align-items: center; margin: 4px 0; }
        .hs-name-row input[type="text"] { flex: 1; min-width: 0; }
        .hs-name-row span { opacity: .5; flex-shrink: 0; }
        .hs-btn-remove { padding: 2px 6px !important; font-size: 11px; }
        .hs-settings.hs-disabled .checkbox-label, .hs-settings.hs-disabled .subsettings, .hs-settings.hs-disabled select { opacity: .35; pointer-events: none; }
        .hs-settings .button[disabled] { opacity: .4; cursor: not-allowed; }
      `;
      document.head.appendChild(style);
    }

    function openDialog() {
      if (dialog) { dialog.style.display = 'block'; overlay.style.display = 'block'; renderDialog(); return; }

      overlay = document.createElement('div');
      overlay.className = 'hs-overlay';
      overlay.addEventListener('click', closeDialog);
      document.body.appendChild(overlay);

      dialog = document.createElement('div');
      dialog.className = 'hs-dialog';
      document.body.appendChild(dialog);

      renderDialog();
    }

    function closeDialog() {
      // Discard any unsaved changes
      workingSettings = loadForScope(currentScope);
      isDirty = false;
      if (dialog) dialog.style.display = 'none';
      if (overlay) overlay.style.display = 'none';
    }
    closeAO3Dialog = closeDialog;

    function renderDialog() {
      if (!dialog) return;
      let h = '<div style="position:relative"><h3>\u26A7 Headspace</h3><button id="hs-close" style="position:absolute;top:0;right:0;background:none;border:none;font-size:20px;cursor:pointer;color:inherit;opacity:.5;padding:0 4px" title="Close">\u2715</button></div>';
      h += '<div class="hs-settings">';
      h += buildSettingsHTML({ ao3: true });
      h += '</div>';
      dialog.innerHTML = h;
      bindPanelEvents(dialog, renderDialog);
    }

    function injectMenu() {
      // Find or create the #scriptconfig dropdown
      let scriptConfig = document.querySelector('#scriptconfig');
      if (!scriptConfig) {
        const nav = document.querySelector('nav[aria-label="Site"] ul.primary');
        if (!nav) { console.warn('[headspace] AO3 nav not found'); return; }

        scriptConfig = document.createElement('li');
        scriptConfig.className = 'dropdown';
        scriptConfig.id = 'scriptconfig';
        scriptConfig.setAttribute('aria-haspopup', 'true');
        scriptConfig.innerHTML = `
          <a class="dropdown-toggle" href="/" data-toggle="dropdown" data-target="#">Userscripts</a>
          <ul class="menu dropdown-menu"></ul>`;
        // Insert before the search li
        const searchLi = nav.querySelector('li.search');
        if (searchLi) nav.insertBefore(scriptConfig, searchLi);
        else nav.appendChild(scriptConfig);
      }

      const menu = scriptConfig.querySelector('ul.menu, ul.dropdown-menu');
      if (!menu) return;

      // Add our entry if not already present
      if (!document.querySelector('#opencfg_headspace')) {
        const li = document.createElement('li');
        li.innerHTML = '<a href="javascript:void(0);" id="opencfg_headspace">Headspace</a>';
        menu.appendChild(li);
        li.querySelector('a').addEventListener('click', (e) => {
          e.preventDefault();
          openDialog();
        });
      }
    }

    injectStyles();
    injectMenu();
    return { renderPanel: renderDialog };
  }

  // =====================================================================
  //  INIT
  // =====================================================================
  async function init() {
    const adapter = SITE === 'lit' ? initLiterotica() : initAO3();

    await loadCompromise();
    adapter.renderPanel();

    const settings = getActive();
    if (settings.enabled && (settings.changePronouns || settings.changeNames)) {
      setTimeout(() => { applyReplacements(); markClean(); }, 100);
    }

    // Literotica loads pages dynamically — observe for new content.
    // AO3 content is static, so no observer needed (and it causes selection issues).
    if (SITE === 'lit') {
      let debounce;
      let isReplacing = false;
      const origApply = applyReplacements;

      // Wrap applyReplacements to pause observer during DOM writes
      const safeApply = () => {
        isReplacing = true;
        origApply();
        setTimeout(() => { isReplacing = false; }, 50);
      };

      const observer = new MutationObserver(() => {
        if (isReplacing) return;
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          const s = getActive();
          if (s.enabled && (s.changePronouns || s.changeNames)) safeApply();
        }, 400);
      });
      const contentArea = document.querySelector('[class*="panel"]') || document.body;
      observer.observe(contentArea, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 200);
  } else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(init, 200));
  }
})();
