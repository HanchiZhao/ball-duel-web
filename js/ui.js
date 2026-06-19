import { roleOptions } from './roleRegistry.js';

function el(id) { return document.getElementById(id); }

export class UIController {
  constructor(game) {
    this.game = game;
    this.modeSelect = el('modeSelect');
    this.ffaPanel = el('ffaPanel');
    this.teamPanel = el('teamPanel');
    this.ffaCount = el('ffaCount');
    this.ffaRoles = el('ffaRoles');
    this.teamCount = el('teamCount');
    this.teamEditors = el('teamEditors');
    this.startBtn = el('startBtn');
    this.pauseBtn = el('pauseBtn');
    this.resetBtn = el('resetBtn');
    this.randomBtn = el('randomBtn');
    this.quickStartBtn = el('quickStartBtn');
    this.sameBtn = el('sameBtn');
    this.roleCountText = el('roleCountText');
    this.winnerText = el('winnerText');
    this.timeText = el('timeText');
    this.engineStatus = el('engineStatus');
    this.roles = roleOptions();
  }

  init() {
    this.roleCountText.textContent = `${this.roles.length} roles`;
    this.modeSelect.addEventListener('change', () => this.renderMode());
    this.ffaCount.addEventListener('change', () => this.renderFfaRoles({ preserve: true }));
    this.teamCount.addEventListener('change', () => this.renderTeamEditors({ preserve: true }));
    this.startBtn.addEventListener('click', () => this.startGame());
    this.pauseBtn.addEventListener('click', () => this.game.togglePause());
    this.resetBtn.addEventListener('click', () => this.game.resetWorld());
    this.randomBtn.addEventListener('click', () => this.randomizeCurrentSelections());
    this.quickStartBtn.addEventListener('click', () => this.quickStart());
    this.sameBtn.addEventListener('click', () => this.restartSameLineup());
    this.renderMode();
    this.game.draw();
  }

  renderMode() {
    const teams = this.modeSelect.value === 'teams';
    this.ffaPanel.classList.toggle('hidden', teams);
    this.teamPanel.classList.toggle('hidden', !teams);
    if (teams) this.renderTeamEditors({ preserve: true });
    else this.renderFfaRoles({ preserve: true });
  }

  roleById(id) {
    return this.roles.find(r => r.id === id) || this.roles[0];
  }

  randomRoleId() {
    return this.roles[Math.floor(Math.random() * this.roles.length)].id;
  }

  roleSelect(name, selectedIndex = 0, onChange = null) {
    const select = document.createElement('select');
    select.name = name;
    this.roles.forEach((role, idx) => {
      const opt = document.createElement('option');
      opt.value = role.id;
      opt.textContent = `${role.zh} / ${role.name}`;
      if (idx === selectedIndex) opt.selected = true;
      select.appendChild(opt);
    });
    if (onChange) select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  createRoleRow(labelText, name, selectedIndex = 0) {
    const row = document.createElement('div');
    row.className = 'role-row';

    const label = document.createElement('div');
    label.className = 'role-label';
    label.textContent = labelText;
    row.appendChild(label);

    const wrap = document.createElement('div');
    wrap.className = 'role-select-wrap';

    const preview = document.createElement('div');
    preview.className = 'role-preview';
    const dot = document.createElement('span');
    dot.className = 'role-dot';
    const desc = document.createElement('span');
    preview.appendChild(dot);
    preview.appendChild(desc);

    const updatePreview = (roleId) => {
      const role = this.roleById(roleId);
      dot.style.background = role.color;
      dot.style.color = role.color;
      desc.textContent = `${role.zh}：${role.desc}`;
    };

    const select = this.roleSelect(name, selectedIndex, updatePreview);
    updatePreview(select.value);
    wrap.appendChild(select);
    wrap.appendChild(preview);
    row.appendChild(wrap);
    return row;
  }

  renderFfaRoles({ preserve = false } = {}) {
    const oldValues = preserve ? [...this.ffaRoles.querySelectorAll('select')].map(s => s.value) : [];
    const count = clampInt(this.ffaCount.value, 2, 12);
    this.ffaCount.value = count;
    this.ffaRoles.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const old = oldValues[i];
      const selectedIndex = old ? Math.max(0, this.roles.findIndex(r => r.id === old)) : i % this.roles.length;
      this.ffaRoles.appendChild(this.createRoleRow(`P${i + 1}`, `ffa-${i}`, selectedIndex));
    }
  }

  renderTeamEditors({ preserve = false } = {}) {
    const oldTeams = preserve ? [...this.teamEditors.querySelectorAll('.team-box')].map(box => ({
      count: box.querySelector('input')?.value,
      roles: [...box.querySelectorAll('select')].map(s => s.value)
    })) : [];

    const teamCount = clampInt(this.teamCount.value, 2, 6);
    this.teamCount.value = teamCount;
    this.teamEditors.innerHTML = '';
    for (let t = 0; t < teamCount; t++) {
      const box = document.createElement('div');
      box.className = 'team-box';

      const title = document.createElement('div');
      title.className = 'team-title';
      const name = document.createElement('span');
      name.textContent = `阵营 ${t + 1}`;
      const countInput = document.createElement('input');
      countInput.type = 'number';
      countInput.min = '1';
      countInput.max = '8';
      countInput.value = oldTeams[t]?.count || '2';
      countInput.dataset.teamCount = String(t);
      title.appendChild(name);
      title.appendChild(countInput);
      box.appendChild(title);

      const rolesWrap = document.createElement('div');
      rolesWrap.className = 'role-list';
      box.appendChild(rolesWrap);

      const renderMembers = () => {
        const oldRoles = [...rolesWrap.querySelectorAll('select')].map(s => s.value);
        const sourceRoles = oldRoles.length ? oldRoles : (oldTeams[t]?.roles || []);
        const count = clampInt(countInput.value, 1, 8);
        countInput.value = count;
        rolesWrap.innerHTML = '';
        for (let p = 0; p < count; p++) {
          const old = sourceRoles[p];
          const selectedIndex = old ? Math.max(0, this.roles.findIndex(r => r.id === old)) : (t + p) % this.roles.length;
          rolesWrap.appendChild(this.createRoleRow(`T${t + 1}P${p + 1}`, `team-${t}-${p}`, selectedIndex));
        }
      };
      countInput.addEventListener('change', renderMembers);
      renderMembers();
      this.teamEditors.appendChild(box);
    }
  }

  randomizeCurrentSelections() {
    const selects = this.modeSelect.value === 'teams'
      ? [...this.teamEditors.querySelectorAll('select')]
      : [...this.ffaRoles.querySelectorAll('select')];
    for (const select of selects) {
      select.value = this.randomRoleId();
      select.dispatchEvent(new Event('change'));
    }
  }

  quickStart() {
    if (this.modeSelect.value === 'ffa') {
      if (!this.ffaRoles.children.length) this.renderFfaRoles();
    } else {
      if (!this.teamEditors.children.length) this.renderTeamEditors();
    }
    this.randomizeCurrentSelections();
    this.startGame();
  }

  restartSameLineup() {
    if (!this.game.restartLastSetup()) {
      this.winnerText.textContent = '还没有上一局阵容：请先开始一局，或使用一键开始。';
    }
  }

  startGame() {
    const setup = this.collectSetup();
    this.game.startFromSetup(setup);
  }

  collectSetup() {
    if (this.modeSelect.value === 'teams') {
      const teams = [];
      const boxes = [...this.teamEditors.querySelectorAll('.team-box')];
      boxes.forEach(box => {
        const roles = [...box.querySelectorAll('select')].map(s => s.value);
        teams.push({ roles });
      });
      return { mode: 'teams', teams };
    }
    return {
      mode: 'ffa',
      roles: [...this.ffaRoles.querySelectorAll('select')].map(s => s.value)
    };
  }

  onGameStatus(status) {
    this.winnerText.textContent = status.winnerText;
    this.timeText.textContent = status.timeText;
    this.engineStatus.textContent = status.paused ? 'Paused' : (status.running ? 'Running' : 'Ready');
    this.pauseBtn.textContent = status.paused ? '继续' : '暂停';
  }
}

function clampInt(value, low, high) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return low;
  return Math.max(low, Math.min(high, n));
}
