# Ball Duel Web 小球乱斗网页版

Round 5 polish build.

## 本轮内容

- 32 个角色全部保留。
- 新增主题化视觉特效：伤害冲击、回血加号粒子、撞墙火花、纸片碎屑、黑洞扩散、治疗圈绽放、西瓜爆炸、水花、脚印冲击、剑圣斩击等。
- 特效绘制在小球和血量数字下层，尽量不遮挡 HP。
- UI 美化：角色卡片、角色说明、角色颜色点、玻璃拟态面板、竞技场网格和边角光效。
- 新增按钮：随机阵容、一键开始、重开同阵容。
- 仍然支持 GitHub Pages 静态部署，不需要后端。

## 本地运行

推荐用 VS Code 的 Live Server 打开 `index.html`。

## GitHub Pages 更新

把本文件夹根目录里的这些内容上传覆盖原仓库：

- `index.html`
- `style.css`
- `README.md`
- `js/`

上传后等待 1-3 分钟，原 GitHub Pages 链接会自动更新。

## Round 6 Python Sync

This round focuses on aligning web mechanics with the uploaded Python version: split slow systems, control immunity, Python-like collision resolution, Quicksilver binding, Spell chains, GasCan charge/boost timing, Pengci mark decay, Slime split directions, Cresson flowerbeds, SwordSaint timing/hidden state, and selected visual alignment.


## Round 7 Python visual sync
- 调整绘制顺序为 Python 版：遗留物/投射物 → 所有球体 → 所有技能装饰 → 附着纸/印记 → HP。
- 关闭网页额外粒子爆炸与墙面火花，避免偏离 Python 版。
- 补齐 Paperman、Ninja、BlackHole、FruitShooter、Pengci、PoisonFang、Spider、Dragon、JadeFoot、Wave、Cresson、Slime、Guard、AnnoyingOrange、Catherine 等角色的 Python 风格技能建模。
- 加强 ShieldGuard、Sniper、GasCan、King、LiBai、ChiFoodGod 的视觉对齐。
