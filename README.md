# Ball Duel Web 小球乱斗网页版（第二轮）

这是第二轮网页版迁移：HTML + CSS + JavaScript + Canvas，无需 Python、无需 pygame、无需后端。

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

## 第二轮已迁移角色

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

## 本地运行

推荐用 VS Code 的 Live Server：

1. 用 VS Code 打开 `ball-duel-web` 文件夹。
2. 安装插件 Live Server。
3. 右键 `index.html`。
4. 选择 `Open with Live Server`。

也可以直接双击 `index.html`，但部分浏览器可能会拦截 ES module 加载。

## 部署到 GitHub Pages

1. 新建公开仓库，例如 `ball-duel-web`。
2. 上传本文件夹内所有文件。
3. 进入仓库 Settings → Pages。
4. Source 选择 `Deploy from a branch`。
5. Branch 选择 `main`，Folder 选择 `/root`。
6. 保存后等待 1-3 分钟。
7. GitHub 会生成 `https://你的用户名.github.io/ball-duel-web/`。


## Round 3 更新

新增毒牙、蜘蛛、煤气罐、手、龙的传人、玉足、浪花、克雷松。补充纸片人纸片附着到小球身上的视觉效果，并继续保持自由混战和多人阵营模式。
