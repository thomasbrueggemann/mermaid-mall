/**
 * HUD wiring. Deliberately wordless: emoji, numbers and colour only, since the
 * player can't read yet. Everything textual is spoken instead.
 */
import { i18n } from './i18n.js';

const SATCHEL_MAX = 14;

export function createUI() {
  const $ = (id) => document.getElementById(id);

  const el = {
    hud: $('hud'),
    start: $('start'),
    loader: $('loader'),
    purse: $('purse'),
    purseCount: $('purse-count'),
    mission: $('mission'),
    missionShop: $('mission-shop'),
    missionItem: $('mission-item'),
    missionPrice: $('mission-price').querySelector('b'),
    satchel: $('satchel'),
    toast: $('toast'),
    minimap: $('minimap'),
    btnSound: $('btn-sound'),
    btnVoice: $('btn-voice'),
    btnLang: $('btn-lang'),
    btnFull: $('btn-full'),
    btnStartLang: $('btn-start-lang'),
    btnInstall: $('btn-install'),
    titleText: $('title-text'),
  };

  let toastTimer = null;

  const api = {
    el,

    showStart() {
      el.start.classList.remove('hidden', 'leaving');
      el.hud.classList.add('hidden');
    },

    hideStart() {
      el.start.classList.add('leaving');
      setTimeout(() => el.start.classList.add('hidden'), 450);
    },

    showHud() {
      el.hud.classList.remove('hidden');
      el.hud.setAttribute('aria-hidden', 'false');
    },

    setLoading(on) {
      el.loader.classList.toggle('hidden', !on);
    },

    setPurse(value, affordable) {
      el.purseCount.textContent = value;
      el.purse.classList.remove('pop');
      void el.purse.offsetWidth; // restart the animation
      el.purse.classList.add('pop');
      el.mission.classList.toggle('affordable', !!affordable);
    },

    setMission(mission) {
      if (!mission) return;
      el.missionShop.textContent = mission.shop.sign;
      el.missionItem.textContent = mission.item;
      el.missionPrice.textContent = mission.cost;
      el.mission.classList.remove('pop');
      void el.mission.offsetWidth;
      el.mission.classList.add('pop');
    },

    addToSatchel(emoji) {
      const span = document.createElement('span');
      span.textContent = emoji;
      el.satchel.appendChild(span);
      while (el.satchel.children.length > SATCHEL_MAX) el.satchel.firstChild.remove();
    },

    toast(text) {
      el.toast.textContent = text;
      el.toast.classList.remove('show');
      void el.toast.offsetWidth;
      el.toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.toast.classList.remove('show'), 1600);
    },

    /** Sends the purchased item flying from the shop into the satchel. */
    flyToSatchel(emoji, screenX, screenY) {
      const fly = document.createElement('div');
      fly.textContent = emoji;
      Object.assign(fly.style, {
        position: 'fixed',
        left: `${screenX}px`,
        top: `${screenY}px`,
        fontSize: '3rem',
        pointerEvents: 'none',
        zIndex: '15',
        transform: 'translate(-50%, -50%)',
        filter: 'drop-shadow(0 4px 12px rgba(0,0,0,.5))',
      });
      document.body.appendChild(fly);

      const target = el.satchel.getBoundingClientRect();
      const tx = target.left + target.width / 2 - screenX;
      const ty = target.top + target.height / 2 - screenY;

      fly
        .animate(
          [
            { transform: 'translate(-50%, -50%) scale(0.3) rotate(0deg)', opacity: 0 },
            { transform: 'translate(-50%, -160%) scale(1.6) rotate(12deg)', opacity: 1, offset: 0.3 },
            {
              transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0.5) rotate(-20deg)`,
              opacity: 0.9,
            },
          ],
          { duration: 1300, easing: 'cubic-bezier(.3,.1,.4,1)' },
        )
        .addEventListener('finish', () => {
          fly.remove();
          api.addToSatchel(emoji);
        });
    },

    setToggleState(button, on) {
      button.classList.toggle('off', !on);
    },

    syncLanguage() {
      el.btnLang.textContent = i18n.t.flag;
      el.btnStartLang.textContent = i18n.t.flag;
      el.titleText.textContent = i18n.t.title;
      document.documentElement.lang = i18n.lang;
      document.title = i18n.t.title;
    },

    showInstall(handler) {
      el.btnInstall.classList.remove('hidden');
      el.btnInstall.onclick = handler;
    },

    hideInstall() {
      el.btnInstall.classList.add('hidden');
    },
  };

  api.syncLanguage();
  return api;
}
