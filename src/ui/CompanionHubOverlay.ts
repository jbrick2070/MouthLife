import { SMOOTH_BASK_THRESHOLD } from '../config/gameConfig';
import {
  getHistoryNoteById,
  getHostCityById,
  HISTORICAL_FIELD_NOTES,
  HOST_CITIES,
  REALISTIC_SKIN_TONES,
} from '../config/hostsAndHistory';
import { UPGRADE_CATALOG } from '../config/upgrades';
import { CompanionArchSim } from '../engine/companion/CompanionArchSim';
import { DisposerBag, type EventBus } from '../engine/EventBus';
import type { SaveSystem } from '../engine/persistence/SaveSystem';
import type { HubCameraFocus } from '../engine/render/SceneManager';
import type { OverlayView } from '../engine/types';
import { getCartridgeById, isPlayableWorld } from '../worlds/worldRegistry';

type ActiveModal = 'none' | 'profile' | 'lab' | 'history' | 'sync';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class CompanionHubOverlay implements OverlayView {
  private disposers = new DisposerBag();
  private container: HTMLElement | null = null;
  private tab: HubCameraFocus = 'companion';
  private selectedCityId = 'toronto';
  private activeModal: ActiveModal = 'none';
  private statusBanner = '';

  constructor(
    private readonly bus: EventBus,
    private readonly saveSys: SaveSystem,
    private readonly actions: {
      onTabChanged: (tab: HubCameraFocus, cityId: string) => void;
      onLaunchArcadeWorld: (worldId: string) => void;
      onLaunchPulpRescue: () => void;
      onLaunchBrushAlong: () => void;
      onReplayCosmicIntro: () => void;
      onPlaySparkleSfx: () => void;
      onPlayTreatSfx: () => void;
      onTreatSplat?: () => number;
      getSplatCount?: () => number;
      onPlayUiTap: () => void;
      isMuted: () => boolean;
      onToggleMute: () => void;
    }
  ) {}

  mount(root: HTMLElement): void {
    const save = this.saveSys.getSave();
    CompanionArchSim.reconcileOfflineElapsed(save.companion, Date.now());
    this.selectedCityId = save.playerProfile.homeCityId || 'toronto';

    this.container = document.createElement('div');
    this.container.className = 'hub-shell';
    root.appendChild(this.container);

    this.disposers.add(
      this.bus.on('save:updated', () => {
        if (this.activeModal === 'none') {
          this.render();
        }
      })
    );

    this.actions.onTabChanged(this.tab, this.selectedCityId);
    this.render();
  }

  /** Called when the player taps a city pin directly on the 3D Earth globe. */
  selectCityFromGlobe(cityId: string): void {
    if (this.tab !== 'globe') return;
    this.selectedCityId = cityId;
    this.actions.onPlayUiTap();
    this.actions.onTabChanged('globe', this.selectedCityId);
    this.render();
  }

  setStatusBanner(text: string): void {
    this.statusBanner = text;
    if (this.activeModal === 'none') this.render();
  }

  private render(): void {
    if (!this.container) return;
    const save = this.saveSys.getSave();
    const comp = save.companion;
    const skin =
      REALISTIC_SKIN_TONES[save.playerProfile.skinToneIndex] ?? REALISTIC_SKIN_TONES[3];
    const homeCity = getHostCityById(save.playerProfile.homeCityId);
    const activeCity = getHostCityById(this.selectedCityId);

    const needsPulpRescue = comp.pulpIntegrity <= 0;
    const inSmoothBask = comp.smoothnessIndex >= SMOOTH_BASK_THRESHOLD && !needsPulpRescue;

    const floatingStatusText = needsPulpRescue
      ? '🚨 Pulp Shield Breached! Scramble HYDRA-1 to Avoid the Dreaded Root Canal!'
      : inSmoothBask
        ? '✨ Mirror-Wet Smooth Bask Active • Crystallizing +6 Fluoride Ions/hr'
        : comp.enamelShield < 100
          ? '⚠️ Sticky Treat Acid Load Active • Brush-Along or Dive to Remineralize!'
          : '💧 Saliva Stasis Protected • Rub or Tap the 3D Teeth • Drag Gums to Orbit';

    const splatCount = this.actions.getSplatCount?.() ?? 0;
    const splatHint =
      this.tab === 'companion' && splatCount > 0
        ? `<div class="splat-hint-pill">🫧 Rub ${splatCount} sugar splat${splatCount > 1 ? 's' : ''} off the 3D teeth — or Brush-Along / Dive to clear!</div>`
        : '';
    const globeHint =
      this.tab === 'globe'
        ? `<div class="splat-hint-pill">🌍 Tap a glowing city pin on the 3D globe to pick your next dive</div>`
        : '';

    const bottomDeckHtml =
      this.tab === 'companion'
        ? this.buildCompanionDeckHtml()
        : this.buildGlobeCampaignDeckHtml(activeCity.id);

    this.container.innerHTML = `
      <div class="hub-top-bar glass-card ui-interactive">
        <div class="row-between">
          <button type="button" id="btn-open-profile" class="btn btn-sm" title="Customize Host & Skin Tone">
            <span style="width:14px;height:14px;border-radius:50%;background:${skin.hex};border:1px solid #fff;display:inline-block;"></span>
            <span>${escapeHtml(save.playerProfile.displayName)} • ${escapeHtml(homeCity.city)}</span>
          </button>

          <div class="row-wrap">
            <span class="pill-badge" title="Fluoride Ions (Currency)">✦ <strong id="val-ions">${save.fluorideIons}</strong> Ions</span>
            <span class="pill-badge" title="Monotonic Habit Stamps (Never lost on missed days!)">🦷 <strong id="val-stamps">${save.totalBrushStamps}</strong> Stamps</span>
            <button type="button" id="btn-toggle-mute" class="btn btn-sm" aria-label="Toggle Sound">
              ${this.actions.isMuted() ? '🔇' : '🔊'}
            </button>
          </div>
        </div>

        <div class="row-between" style="margin-top:7px;">
          <div class="seg-tabs">
            <button type="button" id="tab-companion" class="seg-tab ${this.tab === 'companion' ? 'active' : ''}">
              🦷 Smooth Bask
            </button>
            <button type="button" id="tab-globe" class="seg-tab ${this.tab === 'globe' ? 'active' : ''}">
              🌍 Earth Campaign
            </button>
          </div>
          <div style="font-size:0.72rem;color:var(--text-muted);">
            ${save.remineralizedOverdriveRuns > 0 ? `⚡ Overdrive (${save.remineralizedOverdriveRuns}) ` : ''}
            ${save.pendingSupplyBeacons > 0 ? `📡 Beacons (${save.pendingSupplyBeacons})` : ''}
          </div>
        </div>
      </div>

      <div class="hub-center-callout">
        <div class="bask-floating-pill">
          ${floatingStatusText}
        </div>
        ${splatHint}${globeHint}
        ${
          this.statusBanner
            ? `<div style="margin-top:6px;font-size:0.76rem;color:#fde68a;background:rgba(6,24,38,0.85);padding:4px 12px;border-radius:99px;display:inline-block;">${escapeHtml(this.statusBanner)}</div>`
            : ''
        }
      </div>

      <div class="hub-bottom-deck glass-card ui-interactive">
        ${bottomDeckHtml}
      </div>

      ${this.activeModal !== 'none' ? this.buildModalHtml() : ''}
    `;

    this.bindEvents();
  }

  private buildCompanionDeckHtml(): string {
    const save = this.saveSys.getSave();
    const comp = save.companion;
    const homeCity = getHostCityById(save.playerProfile.homeCityId);
    const treat = homeCity.signatureTreat;
    const needsPulpRescue = comp.pulpIntegrity <= 0;
    const homeWorldId = isPlayableWorld(homeCity.worldId) ? homeCity.worldId : 'world_1';
    const homeWorldTitle = getCartridgeById(homeWorldId).title;

    const meters = [
      {
        label: 'Smooth',
        val: Math.round(comp.smoothnessIndex),
        color: comp.smoothnessIndex >= SMOOTH_BASK_THRESHOLD ? '#2dd4bf' : '#38bdf8',
      },
      { label: 'Enamel', val: Math.round(comp.enamelShield), color: '#67e8f9' },
      { label: 'Dentin', val: Math.round(comp.dentinShield), color: '#fbbf24' },
      {
        label: 'Pulp',
        val: Math.round(comp.pulpIntegrity),
        color: comp.pulpIntegrity <= 25 ? '#fb7185' : '#34d399',
      },
    ];

    const reservoirHtml =
      comp.unclaimedIdleIons > 0
        ? `<button type="button" id="btn-claim-reservoir" class="btn btn-gold btn-sm" style="width:100%;">
            ✨ Claim +${comp.unclaimedIdleIons} Smooth-Bask Crystallized Fluoride Ions
          </button>`
        : '';

    return `
      <div class="shield-grid">
        ${meters
          .map(
            (m) => `
          <div class="mini-meter">
            <div class="mini-meter-label">
              <span>${m.label}</span>
              <strong style="color:#fff;">${m.val}%</strong>
            </div>
            <div class="mini-meter-bar">
              <div class="mini-meter-fill" style="width:${m.val}%;background:${m.color};"></div>
            </div>
          </div>
        `
          )
          .join('')}
      </div>

      ${reservoirHtml}

      <div class="hub-actions-primary">
        <button type="button" id="btn-start-brush-along" class="btn btn-primary">
          🪥 2-Min Sink Brush-Along
        </button>
        ${
          needsPulpRescue
            ? `<button type="button" id="btn-launch-rescue" class="btn btn-danger">
                🚨 90s Pulp Rescue!
              </button>`
            : `<button type="button" id="btn-launch-arcade" class="btn btn-primary" data-world-id="${homeWorldId}">
                🚀 Dive: ${escapeHtml(homeWorldTitle)}
              </button>`
        }
      </div>

      <div class="row-between" style="flex-wrap:wrap;">
        <button type="button" id="btn-feed-treat" class="btn btn-sm" title="${escapeHtml(treat.phDropNote)}">
          ${treat.emoji} Treat: ${escapeHtml(treat.name)} (+20 Ions)
        </button>

        <div class="row-wrap">
          <button type="button" id="btn-open-lab" class="btn btn-sm">🔬 Lab</button>
          <button type="button" id="btn-open-history" class="btn btn-sm">📜 History</button>
          <button type="button" id="btn-open-sync" class="btn btn-sm">☁️ Sync</button>
          <button type="button" id="btn-replay-cosmic" class="btn btn-sm" title="Replay Cosmic Enamel & Diamond Intro">✦ Cosmic</button>
        </div>
      </div>
    `;
  }

  private buildGlobeCampaignDeckHtml(cityId: string): string {
    const save = this.saveSys.getSave();
    const city = getHostCityById(cityId);
    const rec = save.worlds[city.worldId];
    const hist = getHistoryNoteById(city.historyNoteId);
    const stampUnlocked = save.totalBrushStamps >= city.unlockStampsRequired;

    return `
      <div class="city-strip">
        ${HOST_CITIES.map(
          (c) => `
          <button
            type="button"
            class="city-pill ${c.id === city.id ? 'active' : ''}"
            data-city-id="${c.id}"
          >
            ${c.isOrbital ? '🛰️' : '📍'} ${escapeHtml(c.city)}
          </button>
        `
        ).join('')}
      </div>

      <div style="background:rgba(4,16,28,0.68);border:1px solid rgba(94,234,212,0.2);border-radius:12px;padding:9px 11px;">
        <div class="row-between">
          <div class="row-wrap">
            <span style="width:14px;height:14px;border-radius:50%;background:${city.hostSkinToneHex};border:1px solid #fff;display:inline-block;"></span>
            <strong style="font-size:0.88rem;">${escapeHtml(city.hostName)}</strong>
            <span style="font-size:0.74rem;color:var(--text-muted);">• ${escapeHtml(city.hostRole)}</span>
          </div>
          <span class="pill-badge">${rec?.bestGrade && rec.bestGrade !== 'NONE' ? `Best: ${rec.bestGrade}` : 'Unrated'}</span>
        </div>
        <p style="margin:5px 0;font-size:0.77rem;color:#cbd5e1;line-height:1.38;">
          ${escapeHtml(city.scenarioSummary)}
        </p>
        ${
          hist
            ? `<div style="font-size:0.72rem;color:#5eead4;">
                📜 <strong>${escapeHtml(hist.yearLabel)}:</strong> ${escapeHtml(hist.title)}
              </div>`
            : ''
        }
      </div>

      <div class="row-between">
        <span style="font-size:0.74rem;color:var(--text-muted);">
          ${
            city.playableInSlice && isPlayableWorld(city.worldId)
              ? `<strong style="color:#5eead4;">${escapeHtml(getCartridgeById(city.worldId).title)}</strong> • ${escapeHtml(
                  getCartridgeById(city.worldId).challengeBlurb ?? '3 Districts • Brush + Floss Zip + Fluoride Surge'
                )}`
              : `Campaign Expansion Preview • ${stampUnlocked ? 'Milestone Reached!' : `Unlocks at ${city.unlockStampsRequired} Habit Stamps`}`
          }
        </span>
        ${
          city.playableInSlice && isPlayableWorld(city.worldId)
            ? `<button type="button" id="btn-globe-dive" class="btn btn-primary">
                🚀 Dive Into ${escapeHtml(city.city)} →
              </button>`
            : `<button type="button" id="btn-open-history" class="btn btn-sm">
                📜 Read ${escapeHtml(city.city)} Dental History
              </button>`
        }
      </div>
    `;
  }

  private buildModalHtml(): string {
    const save = this.saveSys.getSave();

    if (this.activeModal === 'profile') {
      return `
        <div class="modal-backdrop" id="modal-bg">
          <div class="modal-sheet" onclick="event.stopPropagation()">
            <div class="row-between" style="margin-bottom:10px;">
              <h3 style="margin:0;font-size:1rem;">🧑🏽‍🚀 Host Identity & Inclusive Skin Tone</h3>
              <button type="button" id="btn-close-modal" class="btn btn-sm">✕ Close</button>
            </div>
            <label style="font-size:0.78rem;color:var(--text-muted);display:block;margin-bottom:4px;">Display Name</label>
            <input
              id="inp-host-name"
              type="text"
              maxlength="24"
              value="${escapeHtml(save.playerProfile.displayName)}"
              style="width:100%;padding:8px 10px;border-radius:10px;border:1px solid var(--glass-border);background:#041320;color:#fff;font-size:0.88rem;margin-bottom:10px;"
            />
            <div style="font-size:0.78rem;color:var(--text-muted);">Realistic Human Skin Tone (Fitzpatrick I–VI)</div>
            <div class="swatch-row">
              ${REALISTIC_SKIN_TONES.map(
                (t, idx) => `
                <button
                  type="button"
                  class="skin-swatch ${idx === save.playerProfile.skinToneIndex ? 'selected' : ''}"
                  style="background:${t.hex};"
                  title="${escapeHtml(t.label)}"
                  data-skin-idx="${idx}"
                ></button>
              `
              ).join('')}
            </div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:8px;">Home City & Signature Regional Treat</div>
            <div class="row-wrap" style="margin-top:6px;">
              ${HOST_CITIES.map(
                (c) => `
                <button
                  type="button"
                  class="btn btn-sm ${c.id === save.playerProfile.homeCityId ? 'btn-primary' : ''}"
                  data-home-city="${c.id}"
                >
                  ${c.signatureTreat.emoji} ${escapeHtml(c.city)}
                </button>
              `
              ).join('')}
            </div>
            <div style="margin-top:14px;text-align:right;">
              <button type="button" id="btn-save-profile" class="btn btn-primary">Save Host Profile</button>
            </div>
          </div>
        </div>
      `;
    }

    if (this.activeModal === 'lab') {
      return `
        <div class="modal-backdrop" id="modal-bg">
          <div class="modal-sheet" onclick="event.stopPropagation()">
            <div class="row-between" style="margin-bottom:10px;">
              <h3 style="margin:0;font-size:1rem;">🔬 Biophysical Actuator Lab (${save.fluorideIons} Ions)</h3>
              <button type="button" id="btn-close-modal" class="btn btn-sm">✕ Close</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              ${UPGRADE_CATALOG.map((u) => {
                const unlocked = save.unlockedUpgrades.includes(u.id);
                const equipped = save.equippedUpgrades[u.slot] === u.id;
                const canAfford = save.fluorideIons >= u.ionCost;
                return `
                  <div style="background:rgba(4,16,28,0.8);border:1px solid ${equipped ? '#2dd4bf' : 'rgba(148,184,204,0.22)'};border-radius:12px;padding:10px;">
                    <div class="row-between">
                      <div>
                        <strong style="font-size:0.88rem;color:#fff;">${escapeHtml(u.name)}</strong>
                        <span class="pill-badge" style="margin-left:5px;">${u.slot.toUpperCase()}</span>
                      </div>
                      ${
                        unlocked
                          ? `<button type="button" class="btn btn-sm ${equipped ? 'btn-primary' : ''}" data-equip-id="${u.id}">
                              ${equipped ? '✓ Equipped' : 'Equip'}
                            </button>`
                          : `<button type="button" class="btn btn-sm ${canAfford ? 'btn-gold' : ''}" data-buy-id="${u.id}" ${!canAfford ? 'disabled style="opacity:0.45;"' : ''}>
                              Unlock (${u.ionCost} Ions)
                            </button>`
                      }
                    </div>
                    <div style="font-size:0.78rem;color:#bae6fd;margin-top:4px;">${escapeHtml(u.tagline)}</div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;">${escapeHtml(u.scientificNote)}</div>
                    <div style="font-size:0.69rem;color:#5eead4;margin-top:4px;">
                      Free Auto-Unlock: ${u.stampUnlockThreshold} Habit Stamps or Clear ${u.worldClearUnlockId?.replace('_', ' ').toUpperCase()}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }

    if (this.activeModal === 'history') {
      return `
        <div class="modal-backdrop" id="modal-bg">
          <div class="modal-sheet" onclick="event.stopPropagation()">
            <div class="row-between" style="margin-bottom:10px;">
              <h3 style="margin:0;font-size:1rem;">📜 Global Dental History & Enamel Almanac</h3>
              <button type="button" id="btn-close-modal" class="btn btn-sm">✕ Close</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              ${HISTORICAL_FIELD_NOTES.map((n) => {
                const unlocked = save.unlockedHistoryNotes.includes(n.id);
                return `
                  <div style="background:rgba(4,16,28,0.82);border:1px solid ${unlocked ? 'rgba(45,212,191,0.4)' : 'rgba(148,184,204,0.18)'};border-radius:12px;padding:10px;">
                    <div class="row-between">
                      <span style="font-size:0.72rem;font-weight:700;color:#38bdf8;">${escapeHtml(n.yearLabel)} • ${escapeHtml(n.locationLabel)}</span>
                      <span class="pill-badge">${unlocked ? '✓ Discovered' : 'Preview Archive'}</span>
                    </div>
                    <div style="font-weight:700;font-size:0.88rem;margin:4px 0;color:#fff;">${escapeHtml(n.title)}</div>
                    <p style="margin:0 0 5px 0;font-size:0.77rem;color:#cbd5e1;line-height:1.4;">${escapeHtml(n.summary)}</p>
                    <div style="font-size:0.73rem;color:#99f6e4;"><strong>Biophysical Takeaway:</strong> ${escapeHtml(n.enamelLesson)}</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }

    // Sync Code Backup Modal
    const syncCode = this.saveSys.exportSyncCode();
    return `
      <div class="modal-backdrop" id="modal-bg">
        <div class="modal-sheet" onclick="event.stopPropagation()">
          <div class="row-between" style="margin-bottom:10px;">
            <h3 style="margin:0;font-size:1rem;">☁️ Cross-Device Sync Code (Zero Sign-Up)</h3>
            <button type="button" id="btn-close-modal" class="btn btn-sm">✕ Close</button>
          </div>
          <p style="font-size:0.78rem;color:var(--text-muted);margin-top:0;">
            Copy your portable <code>ML2:</code> Sync Code or download a <code>.mouthlife.json</code> snapshot to carry Habit Stamps & Upgrades between phone and desktop.
          </p>
          <textarea
            id="txt-sync-export"
            readonly
            rows="3"
            style="width:100%;border-radius:10px;border:1px solid var(--glass-border);background:#041320;color:#99f6e4;font-size:0.74rem;padding:8px;"
          >${escapeHtml(syncCode)}</textarea>
          <div class="row-wrap" style="margin:8px 0 12px 0;">
            <button type="button" id="btn-copy-sync" class="btn btn-primary btn-sm">📋 Copy ML2 Code</button>
            <button type="button" id="btn-download-json" class="btn btn-sm">💾 Download .mouthlife.json</button>
          </div>
          <label style="font-size:0.78rem;color:var(--text-muted);display:block;margin-bottom:4px;">Import ML2 Sync Code</label>
          <textarea
            id="txt-sync-import"
            placeholder="Paste ML2:... code here"
            rows="2"
            style="width:100%;border-radius:10px;border:1px solid var(--glass-border);background:#041320;color:#fff;font-size:0.76rem;padding:8px;"
          ></textarea>
          <div style="margin-top:8px;text-align:right;">
            <button type="button" id="btn-apply-sync" class="btn btn-gold btn-sm">Import & Merge</button>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    if (!this.container) return;
    const save = this.saveSys.getSave();

    this.container.querySelector('#tab-companion')?.addEventListener('click', () => {
      this.tab = 'companion';
      this.actions.onPlayUiTap();
      this.actions.onTabChanged('companion', this.selectedCityId);
      this.render();
    });

    this.container.querySelector('#tab-globe')?.addEventListener('click', () => {
      this.tab = 'globe';
      this.actions.onPlayUiTap();
      this.actions.onTabChanged('globe', this.selectedCityId);
      this.render();
    });

    this.container.querySelector('#btn-toggle-mute')?.addEventListener('click', () => {
      this.actions.onToggleMute();
      this.render();
    });

    this.container.querySelector('#btn-claim-reservoir')?.addEventListener('click', () => {
      const claimed = CompanionArchSim.claimIdleReservoir(save.companion);
      if (claimed > 0) {
        save.fluorideIons += claimed;
        this.saveSys.save(save);
        this.actions.onPlaySparkleSfx();
        this.statusBanner = `Crystallized +${claimed} Fluoride Ions from Smooth Bask!`;
        this.render();
      }
    });

    this.container.querySelector('#btn-start-brush-along')?.addEventListener('click', () => {
      this.actions.onLaunchBrushAlong();
    });

    this.container.querySelector<HTMLButtonElement>('#btn-launch-arcade')?.addEventListener('click', (e) => {
      const wid = (e.currentTarget as HTMLButtonElement).dataset.worldId ?? 'world_1';
      this.actions.onLaunchArcadeWorld(wid);
    });

    this.container.querySelector('#btn-globe-dive')?.addEventListener('click', () => {
      const city = getHostCityById(this.selectedCityId);
      if (city.playableInSlice && isPlayableWorld(city.worldId)) {
        this.actions.onLaunchArcadeWorld(city.worldId);
      }
    });

    this.container.querySelector('#btn-launch-rescue')?.addEventListener('click', () => {
      this.actions.onLaunchPulpRescue();
    });

    this.container.querySelector('#btn-feed-treat')?.addEventListener('click', () => {
      this.actions.onPlayTreatSfx();
      const homeCity = getHostCityById(save.playerProfile.homeCityId);
      const res = CompanionArchSim.feedRegionalTreat(save.companion, Date.now());
      save.fluorideIons += res.ionsGranted;
      this.actions.onTreatSplat?.();
      this.saveSys.save(save);
      this.bus.emit('companion:updated', { state: save.companion });

      if (res.triggeredPulpRescue) {
        this.statusBanner =
          '🚨 Acid reached Pulp! Launch 90s Pulp Rescue to avoid the Dreaded Root Canal!';
      } else if (res.ionsGranted > 0) {
        this.statusBanner = `Enjoyed ${homeCity.signatureTreat.name}! +${res.ionsGranted} Ions (Smoothness ${Math.round(save.companion.smoothnessIndex)}%)`;
      } else {
        this.statusBanner = `Enjoyed ${homeCity.signatureTreat.name}! (Hourly Ion bonus 3/3 reached — watch acid load!)`;
      }
      this.render();
    });

    this.container.querySelector('#btn-replay-cosmic')?.addEventListener('click', () => {
      this.actions.onReplayCosmicIntro();
    });

    this.container.querySelectorAll<HTMLButtonElement>('[data-city-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedCityId = btn.dataset.cityId ?? 'toronto';
        this.actions.onPlayUiTap();
        this.actions.onTabChanged('globe', this.selectedCityId);
        this.render();
      });
    });

    // Modal openers & closers
    this.container.querySelector('#btn-open-profile')?.addEventListener('click', () => {
      this.actions.onPlayUiTap();
      this.activeModal = 'profile';
      this.render();
    });
    this.container.querySelector('#btn-open-lab')?.addEventListener('click', () => {
      this.actions.onPlayUiTap();
      this.activeModal = 'lab';
      this.render();
    });
    this.container.querySelector('#btn-open-history')?.addEventListener('click', () => {
      this.actions.onPlayUiTap();
      this.activeModal = 'history';
      this.render();
    });
    this.container.querySelector('#btn-open-sync')?.addEventListener('click', () => {
      this.activeModal = 'sync';
      this.render();
    });

    const closeModal = () => {
      this.activeModal = 'none';
      this.render();
    };
    this.container.querySelector('#btn-close-modal')?.addEventListener('click', closeModal);
    this.container.querySelector('#modal-bg')?.addEventListener('click', closeModal);

    // Profile modal handlers
    this.container.querySelectorAll<HTMLButtonElement>('[data-skin-idx]').forEach((sw) => {
      sw.addEventListener('click', () => {
        save.playerProfile.skinToneIndex = Number(sw.dataset.skinIdx ?? 3);
        this.saveSys.save(save);
        this.render();
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>('[data-home-city]').forEach((b) => {
      b.addEventListener('click', () => {
        save.playerProfile.homeCityId = b.dataset.homeCity ?? 'toronto';
        this.selectedCityId = save.playerProfile.homeCityId;
        this.saveSys.save(save);
        this.render();
      });
    });

    this.container.querySelector('#btn-save-profile')?.addEventListener('click', () => {
      const inp = this.container?.querySelector<HTMLInputElement>('#inp-host-name');
      const cleaned = inp?.value.trim().slice(0, 24) || 'Explorer';
      save.playerProfile.displayName = cleaned;
      this.saveSys.save(save);
      this.activeModal = 'none';
      this.render();
    });

    // Upgrade Lab handlers
    this.container.querySelectorAll<HTMLButtonElement>('[data-buy-id]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.buyId;
        if (id && this.saveSys.purchaseUpgradeWithIons(id)) {
          this.actions.onPlaySparkleSfx();
          this.render();
        }
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>('[data-equip-id]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.equipId;
        if (id && this.saveSys.equipUpgrade(id)) {
          this.render();
        }
      });
    });

    // Sync Code handlers
    this.container.querySelector('#btn-copy-sync')?.addEventListener('click', () => {
      const code = this.saveSys.exportSyncCode();
      navigator.clipboard?.writeText(code).catch(() => {});
      this.statusBanner = 'Copied ML2: Sync Code to clipboard!';
      this.activeModal = 'none';
      this.render();
    });

    this.container.querySelector('#btn-download-json')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(this.saveSys.getSave(), null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'backup.mouthlife.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    this.container.querySelector('#btn-apply-sync')?.addEventListener('click', () => {
      const txt = this.container?.querySelector<HTMLTextAreaElement>('#txt-sync-import');
      const raw = txt?.value.trim() ?? '';
      try {
        this.saveSys.importSyncCode(raw);
        this.statusBanner = 'Sync Code imported & merged cleanly!';
        this.activeModal = 'none';
        this.render();
      } catch (err) {
        this.statusBanner =
          err instanceof Error ? err.message : 'Invalid Sync Code.';
        this.activeModal = 'none';
        this.render();
      }
    });
  }

  dispose(): void {
    this.disposers.disposeAll();
    this.container?.remove();
    this.container = null;
  }
}
