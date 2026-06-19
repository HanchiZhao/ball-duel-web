import { BALL_SPEED, DEFAULT_HP, COLORS } from './config.js';
import {
  NormalSkill,
  HammerSkill,
  VampireSkill,
  HuatuoSkill,
  GhostSkill,
  RibbonSkill,
  IceCurlingSkill,
  PapermanSkill,
  NinjaSkill,
  BlackHoleSkill,
  FruitShooterSkill,
  PengciSkill,
  ShieldGuardSkill,
  SniperSkill,
  SpellSkill,
  CatherineSkill,
  PoisonFangSkill,
  SpiderSkill,
  GasCanSkill,
  HandSkill,
  DragonHeirSkill,
  JadeFootSkill,
  WaveSkill,
  CressonSkill,
  SlimeSkill,
  KingSkill,
  GuardSkill,
  LiBaiSkill,
  ChiFoodGodSkill,
  AnnoyingOrangeSkill,
  QuicksilverSkill,
  SwordSaintSkill
} from './skills/coreSkills.js';

export const ROLES = {
  normal: {
    id: 'normal', name: 'Normal', zh: '普通球', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.magenta,
    desc: '普通身体碰撞造成 5 伤害。', createSkill: () => new NormalSkill()
  },
  hammer: {
    id: 'hammer', name: 'Hammer', zh: '重锤', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.cyan,
    desc: '旋转重锤命中造成 8 伤害。', createSkill: () => new HammerSkill()
  },
  vampire: {
    id: 'vampire', name: 'Vampire', zh: '吸血鬼', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.vampire,
    desc: '碰撞后吸血，目标掉血，自身回血。', createSkill: () => new VampireSkill()
  },
  paperman: {
    id: 'paperman', name: 'Paperman', zh: '纸片人', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.paperWhite,
    desc: '每 2 秒发射纸片，命中后流血并减速 4 秒。', createSkill: () => new PapermanSkill()
  },
  ninja: {
    id: 'ninja', name: 'Ninja', zh: '忍者', hp: DEFAULT_HP, speed: BALL_SPEED * 1.13, color: COLORS.ninjaGreen,
    desc: '高速小球，周期性随机方向投掷逐渐增多的手里剑。', createSkill: () => new NinjaSkill()
  },
  blackhole: {
    id: 'blackhole', name: 'BlackHole', zh: '黑洞', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.voidPurple,
    desc: '发射导弹，命中或撞墙后生成黑洞吸引并持续伤害敌人。', createSkill: () => new BlackHoleSkill()
  },
  fruitshooter: {
    id: 'fruitshooter', name: 'FruitShooter', zh: '水果射手', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.tangerineOrange,
    desc: '每轮向最近敌人连射 3 个随机水果。', createSkill: () => new FruitShooterSkill()
  },
  pengci: {
    id: 'pengci', name: 'Pengci', zh: '碰瓷者', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.pengciBlue,
    desc: '高速花瓶叠碰瓷印记，身体碰撞兑现指数伤害。', createSkill: () => new PengciSkill()
  },
  huatuo: {
    id: 'huatuo', name: 'Huatuo', zh: '华佗', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.huatuo,
    desc: '发射治疗球，治疗自己和队友，伤害敌人。', createSkill: () => new HuatuoSkill()
  },
  shieldguard: {
    id: 'shieldguard', name: 'ShieldGuard', zh: '盾卫', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.shieldSteel,
    desc: '初始 5 层护盾抵挡伤害，周期性恢复并投掷盾牌。', createSkill: () => new ShieldGuardSkill()
  },
  sniper: {
    id: 'sniper', name: 'Sniper', zh: '狙击手', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.sniperBrown,
    desc: '每 1.5 秒装填，满 5 层后发射 50 伤害高速子弹。', createSkill: () => new SniperSkill()
  },
  ghost: {
    id: 'ghost', name: 'Ghost', zh: '幽灵', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.ghost,
    desc: '每 3 秒切换虚化，虚化免疫、+100% 速度、接触 8 伤害。', createSkill: () => new GhostSkill()
  },
  ribbon: {
    id: 'ribbon', name: 'Ribbon', zh: '丝带', hp: DEFAULT_HP, speed: BALL_SPEED * 1.1, color: COLORS.ribbonRed,
    desc: '速度 +10%，三条超长丝带刮伤敌人。', createSkill: () => new RibbonSkill()
  },
  icecurling: {
    id: 'icecurling', name: 'IceCurling', zh: '冰壶', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.ice,
    desc: '周期性定身全场，按身体触碰到的最高区域结算伤害。', createSkill: () => new IceCurlingSkill()
  },
  spell: {
    id: 'spell', name: 'Spell', zh: '咒语', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.spellPurple,
    desc: '音波造成伤害、眩晕和咒印，5 层后锁链吸血。', createSkill: () => new SpellSkill()
  },
  catherine: {
    id: 'catherine', name: 'Catherine', zh: '凯瑟琳', hp: 80, speed: BALL_SPEED, color: COLORS.catherinePurple,
    desc: '定身释放 15 次箭雨，最后发射穿云箭。', createSkill: () => new CatherineSkill()
  }
  ,
  poisonfang: {
    id: 'poisonfang', name: 'PoisonFang', zh: '毒牙', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.poisonGreen,
    desc: '碰墙留下毒牙，敌人碰到会中毒并减速。', createSkill: () => new PoisonFangSkill()
  },
  spider: {
    id: 'spider', name: 'Spider', zh: '蜘蛛', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.spiderPurple,
    desc: '前 5 秒加速，碰墙生成连接自身的动态蛛丝。', createSkill: () => new SpiderSkill()
  },
  gascan: {
    id: 'gascan', name: 'GasCan', zh: '煤气罐', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.gasOrange,
    desc: '蓄力变大后爆冲，撞飞并伤害敌人。', createSkill: () => new GasCanSkill()
  },
  hand: {
    id: 'hand', name: 'Hand', zh: '手', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.handSkin,
    desc: '手掌朝向最近敌人，抓住后大力扔出。', createSkill: () => new HandSkill()
  },
  dragon: {
    id: 'dragon', name: 'DragonHeir', zh: '龙的传人', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.yellow,
    desc: '预警轨道后召唤巨龙穿场，每次碰撞 5 伤害。', createSkill: () => new DragonHeirSkill()
  },
  jadefoot: {
    id: 'jadefoot', name: 'JadeFoot', zh: '玉足', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.footPink,
    desc: '预警后随机落下巨大脚印，范围内 25 伤害。', createSkill: () => new JadeFootSkill()
  },
  wave: {
    id: 'wave', name: 'Wave', zh: '浪花', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.waveBlue,
    desc: '释放向外扩散的水环，命中后伤害并推开敌人。', createSkill: () => new WaveSkill()
  },
  cresson: {
    id: 'cresson', name: 'Cresson', zh: '克雷松', hp: 110, speed: 0, color: COLORS.cressonPink,
    desc: '不会移动，周期性闪现留下花圃，60 秒释放终结光波。', createSkill: () => new CressonSkill()
  },
  slime: {
    id: 'slime', name: 'Slime', zh: '史莱姆', hp: 30, speed: BALL_SPEED * 0.95, color: COLORS.slimeGreen,
    desc: '死亡后分裂成 3 个更小史莱姆，最后阶段碰撞 3 伤害。', createSkill: () => new SlimeSkill(0)
  },
  king: {
    id: 'king', name: 'King', zh: '国王', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.kingGold,
    desc: '开局召唤 2 个护卫，此后每 7.5 秒召唤 1 个护卫。', createSkill: () => new KingSkill()
  },
  guard: {
    id: 'guard', name: 'Guard', zh: '护卫', hp: 30, speed: BALL_SPEED * 0.92, color: COLORS.guardNavy,
    desc: '30 HP 护卫，身体碰撞造成 2 伤害。', createSkill: () => new GuardSkill()
  },
  libai: {
    id: 'libai', name: 'LiBai', zh: '李白', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.libaiBlue,
    desc: '周期性喝酒回血，累计受伤 30 后进入 3 秒狂暴。', createSkill: () => new LiBaiSkill()
  },
  chishishen: {
    id: 'chishishen', name: 'ChiFoodGod', zh: '赤食神', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.chishiRed,
    desc: '吃专属粪碗回血并叠伤害，周期性释放屁圈。', createSkill: () => new ChiFoodGodSkill()
  },
  annoyingorange: {
    id: 'annoyingorange', name: 'AnnoyingOrange', zh: '烦人的橘子', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.annoyingOrange,
    desc: '高频发射乱码弹，每发造成 1 伤害。', createSkill: () => new AnnoyingOrangeSkill()
  },
  quicksilver: {
    id: 'quicksilver', name: 'Quicksilver', zh: '快银', hp: DEFAULT_HP, speed: BALL_SPEED * 1.8, color: COLORS.quicksilver,
    desc: '180% 速度，绑定敌人并拖向墙壁碰撞结算伤害。', createSkill: () => new QuicksilverSkill()
  },
  swordsman: {
    id: 'swordsman', name: 'SwordSaint', zh: '剑圣', hp: DEFAULT_HP, speed: BALL_SPEED, color: COLORS.swordSilver,
    desc: '升空锁定后落剑，随后释放回旋斩。', createSkill: () => new SwordSaintSkill()
  }

};

export function roleOptions() {
  return Object.values(ROLES);
}
