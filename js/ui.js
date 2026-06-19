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
    this.winnerText = el('winnerText');
    this.timeText = el('timeText');
    this.engineStatus = el('engineStatus');
    this.roles = roleOptions();
  }

  init() {
    this.modeSelect.addEventListener('change', () => this.renderMode());
    this.ffaCount.addEventListener('change', () => this.renderFfaRoles());
    this.teamCount.addEventListener('change', () => this.renderTeamEditors());
    this.startBtn.addEventListener('click', () => this.startGame());
    this.pauseBtn.addEventListener('click', () => this.game.togglePause());
    this.resetBtn.addEventListener('click', () => this.game.resetWorld());
    this.renderMode();
    this.game.draw();
  }

  renderMode() {
    const teams = this.modeSelect.value === 'teams';
    this.ffaPanel.classList.toggle('hidden', teams);
    this.teamPanel.classList.toggle('hidden', !teams);
    if (teams) this.renderTeamEditors();
    else this.renderFfaRoles();
  }

  roleSelect(name, selectedIndex = 0) {
    const select = document.createElement('select');
    select.name = name;
    this.roles.forEach((role, idx) => {
      const opt = document.createElement('option');
      opt.value = role.id;
      opt.textContent = `${role.zh} / ${role.name} — ${role.desc}`;
      if (idx === selectedIndex) opt.selected = true;
      select.appendChild(opt);
    });
    return select;
  }

  renderFfaRoles() {
    const count = clampInt(this.ffaCount.value, 2, 12);
    this.ffaCount.value = count;
    this.ffaRoles.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const row = document.createElement('div');
      row.className = 'role-row';
      const label = document.createElement('label');
      const span = document.createElement('span');
      span.textContent = `P${i + 1}`;
      label.appendChild(span);
      label.appendChild(this.roleSelect(`ffa-${i}`, i % this.roles.length));
      row.appendChild(label);
      this.ffaRoles.appendChild(row);
    }
  }

  renderTeamEditors() {
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
      countInput.value = '2';
      countInput.dataset.teamCount = String(t);
      title.appendChild(name);
      title.appendChild(countInput);
      box.appendChild(title);

      const rolesWrap = document.createElement('div');
      rolesWrap.className = 'role-list';
      box.appendChild(rolesWrap);

      const renderMembers = () => {
        const count = clampInt(countInput.value, 1, 8);
        countInput.value = count;
        rolesWrap.innerHTML = '';
        for (let p = 0; p < count; p++) {
          const row = document.createElement('div');
          row.className = 'role-row';
          const label = document.createElement('label');
          const span = document.createElement('span');
          span.textContent = `T${t + 1}P${p + 1}`;
          label.appendChild(span);
          label.appendChild(this.roleSelect(`team-${t}-${p}`, (t + p) % this.roles.length));
          row.appendChild(label);
          rolesWrap.appendChild(row);
        }
      };
      countInput.addEventListener('change', renderMembers);
      renderMembers();
      this.teamEditors.appendChild(box);
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
