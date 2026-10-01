# 傅里叶圆圈绘图机 (Fourier Epicycles)

在画板上随手画一笔，一堆旋转的圆（傅里叶级数 / 本轮 epicycles）就会把你的笔迹复现出来。

**在线体验：** https://honlnk.github.io/fourier-epicycles/

## 玩法

- 左侧画板按住鼠标（或手指）画一笔，松手后右侧的圆圈机器立即开始复现
- 预设图形：**honlnk 花体签名**（默认，来自 Great Vibes 字体）/ 五角星 / 爱心 / 无穷符号
- 拖动「圆圈数量」滑块或在输入框直接填数字（1–1023），观察圆越多、轨迹越接近原笔迹；拉满 1023 即精确还原采样路径
- 可调速度、暂停，显示 / 隐藏圆圈与原笔迹

## 原理

任意闭合曲线都可展开为傅里叶级数 `z(t) = Σ cₙ·e^(iωₙt)`。

页面把你画的笔迹沿弧长均匀重采样为 1024 个点，视为复平面上的周期序列，做一次快速傅里叶变换（FFT）得到各频率分量的幅度与相位，按幅度从大到小排序。每个分量画成一个圆：**半径 = 幅度、转速 = 频率（正频率逆时针、负频率顺时针）、初相 = 相位**。所有圆首尾相接，最外端点的轨迹就是重建的图形——用的圆越多，越贴近原笔迹。

## 本地运行

纯静态页面，无需构建：

```bash
python3 -m http.server -d docs 8000
```

然后访问 http://localhost:8000 （直接双击 `docs/index.html` 也可以）。

## CI / CD

推送到 `main` 分支即自动通过 GitHub Actions 将 `docs/` 部署到 GitHub Pages，见 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)。

## 致谢

「honlnk 签名」预设的字形来自 [Great Vibes](https://fonts.google.com/specimen/Great+Vibes)（Copyright 2010 The Great Vibes Pro Project Authors，[SIL OFL 1.1](https://openfontlicense.org/) 授权）。字形轮廓转 SVG 路径的工具见 [`tools/font2path/`](tools/font2path/)。
