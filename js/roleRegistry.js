import { BALL_SPEED, DEFAULT_HP, COLORS } from './config.js';
import {
  NormalSkill,
  HammerSkill,
  VampireSkill,
  HuatuoSkill,
  GhostSkill,
  RibbonSkill,
  IceCurlingSkill
} from './skills/coreSkills.js';

export const ROLES = {
  normal: {
    id: 'normal',
    name: 'Normal',
    zh: '普通球',
    hp: DEFAULT_HP,
    speed: BALL_SPEED,
    color: COLORS.cyan,
    desc: '普通身体碰撞造成 5 伤害。',
    createSkill: () => new NormalSkill()
  },
  hammer: {
    id: 'hammer',
    name: 'Hammer',
    zh: '重锤',
    hp: DEFAULT_HP,
    speed: BALL_SPEED,
    color: COLORS.yellow,
    desc: '旋转重锤命中造成 8 伤害。',
    createSkill: () => new HammerSkill()
  },
  vampire: {
    id: 'vampire',
    name: 'Vampire',
    zh: '吸血鬼',
    hp: DEFAULT_HP,
    speed: BALL_SPEED,
    color: '#941626',
    desc: '碰撞后吸血，目标掉血，自身回血。',
    createSkill: () => new VampireSkill()
  },
  huatuo: {
    id: 'huatuo',
    name: 'Huatuo',
    zh: '华佗',
    hp: DEFAULT_HP,
    speed: BALL_SPEED,
    color: COLORS.huatuo,
    desc: '发射治疗球，治疗自己和队友，伤害敌人。',
    createSkill: () => new HuatuoSkill()
  },
  ghost: {
    id: 'ghost',
    name: 'Ghost',
    zh: '幽灵',
    hp: DEFAULT_HP,
    speed: BALL_SPEED,
    color: COLORS.ghost,
    desc: '每 3 秒切换虚化，虚化免疫、+100% 速度、接触 8 伤害。',
    createSkill: () => new GhostSkill()
  },
  ribbon: {
    id: 'ribbon',
    name: 'Ribbon',
    zh: '丝带',
    hp: DEFAULT_HP,
    speed: BALL_SPEED * 1.1,
    color: COLORS.ribbonRed,
    desc: '速度 +10%，三条超长丝带刮伤敌人。',
    createSkill: () => new RibbonSkill()
  },
  icecurling: {
    id: 'icecurling',
    name: 'IceCurling',
    zh: '冰壶',
    hp: DEFAULT_HP,
    speed: BALL_SPEED,
    color: COLORS.ice,
    desc: '周期性定身全场，按身体触碰到的最高区域结算伤害。',
    createSkill: () => new IceCurlingSkill()
  }
};

export function roleOptions() {
  return Object.values(ROLES);
}
