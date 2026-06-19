# Ball Duel Web 小球乱斗网页版（第一轮）

这是第一轮网页版迁移：HTML + CSS + JavaScript + Canvas，无需 Python、无需 pygame、无需后端。

## 已包含功能

- 自由混战模式
- 多人阵营模式
- 队友免伤
- 自动移动、碰墙反弹、小球碰撞
- HP 显示
- 红色掉血飘字
- 绿色回血飘字
- 胜负判定
- 手机浏览器可打开游玩

## 第一轮已迁移角色

- 普通球 Normal
- 重锤 Hammer
- 吸血鬼 Vampire
- 华佗 Huatuo
- 幽灵 Ghost
- 丝带 Ribbon
- 冰壶 IceCurling

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
