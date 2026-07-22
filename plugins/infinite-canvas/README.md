# luffy-canvas-site Codex Plugin

让 Codex 可以打开并操作 luffy-canvas-site。

## 安装

macOS / Linux：

```bash
git clone https://github.com/luffysolution-svg/luffy-canvas-site.git
cd luffy-canvas-site
codex plugin marketplace add "$(pwd)"
codex plugin add infinite-canvas@infinite-canvas-local
```

Windows PowerShell：

```powershell
git clone https://github.com/luffysolution-svg/luffy-canvas-site.git
cd luffy-canvas-site
codex plugin marketplace add "$PWD"
codex plugin add infinite-canvas@infinite-canvas-local
```

Windows CMD 将 `$PWD` 替换为 `%cd%`。

安装后新建一个 Codex 任务，然后输入：

```text
帮我打开并连接到 luffy-canvas-site
```
