# Ball Duel Web 小球乱斗网页版（第四轮 / 32 角色版）

这是第四轮网页版迁移：HTML + CSS + JavaScript + Canvas，无需 Python、无需 pygame、无需后端。

## 已包含功能

- 自由混战模式
- 多人阵营模式
- 队友免伤
- 自动移动、碰墙反弹、小球碰撞
- HP 显示，中心血量数字已放大
- 红色掉血飘字
- 绿色回血飘字
- 胜负判定
- 手机浏览器可打开游玩
- 角色列表自动从注册表生成，避免菜单漏角色

## 已迁移角色（32 个）

- 普通球 Normal
- 重锤 Hammer
- 吸血鬼 Vampire
- 纸片人 Paperman
- 忍者 Ninja
- 黑洞 BlackHole
- 水果射手 FruitShooter
- 碰瓷者 Pengci
- 华佗 Huatuo
- 盾卫 ShieldGuard
- 狙击手 Sniper
- 幽灵 Ghost
- 丝带 Ribbon
- 冰壶 IceCurling
- 咒语 Spell
- 凯瑟琳 Catherine
- 毒牙 PoisonFang
- 蜘蛛 Spider
- 煤气罐 GasCan
- 手 Hand
- 龙的传人 DragonHeir
- 玉足 JadeFoot
- 浪花 Wave
- 克雷松 Cresson
- 史莱姆 Slime
- 国王 King
- 护卫 Guard
- 李白 LiBai
- 赤食神 ChiFoodGod
- 烦人的橘子 AnnoyingOrange
- 快银 Quicksilver
- 剑圣 SwordSaint

## Round 4 更新

新增史莱姆、国王、护卫、李白、赤食神、烦人的橘子、快银、剑圣。现在网页版已经基本覆盖 Python 版当前所有角色。部分复杂角色的视觉表现仍可在下一轮继续对齐 Python 版。

## 本地运行

推荐用 VS Code 的 Live Server：

1. 用 VS Code 打开 `ball-duel-web` 文件夹。
2. 安装插件 Live Server。
3. 右键 `index.html`。
4. 选择 `Open with Live Server`。

也可以直接双击 `index.html`，但部分浏览器可能会拦截 ES module 加载。

## 部署到 GitHub Pages

1. 打开你的 `ball-duel-web` 仓库。
2. 上传并覆盖本文件夹内所有文件。
3. 进入仓库 Settings → Pages。
4. Source 选择 `Deploy from a branch`。
5. Branch 选择 `main`，Folder 选择 `/root`。
6. 保存后等待 1-3 分钟。
7. 原网页链接会自动更新。
