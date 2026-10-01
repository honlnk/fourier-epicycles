# font2path — 花体签名路径生成器

把 "honlnk" 用 [Great Vibes](https://fonts.google.com/specimen/Great+Vibes) 花体字体转成 SVG 路径数据，嵌入 `docs/app.js` 作为 demo 的「签名」预设。

## 用法

```bash
cd tools/font2path
curl -sL -o GreatVibes-Regular.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf"
npm install
node gen.js          # 生成 signature-path.txt 和 preview.html
```

然后把 `signature-path.txt` 的内容替换 `docs/app.js` 里 `SIGNATURE_PATH_D` 的字符串即可。

## 实现说明

- opentype.js 的整段排版（`font.getPath(text)`）会因该字体的 GSUB 查找表报错，
  因此改为**逐字形手动排版**（advance + kerning）。
- opentype.js 的 `toPathData()` 存在输出 NaN 的问题（无论是否开启 optimize），
  因此自行序列化路径命令，并对缺失控制点的 Q/C 命令降级为 L（容错）。

## 授权

- Great Vibes: Copyright 2010 The Great Vibes Pro Project Authors, [SIL OFL 1.1](https://openfontlicense.org/)
- 本目录的 TTF 与生成产物不入库（见根目录 .gitignore）
