# Claude Desktop 简体中文补丁

这是 Windows 版 Claude Desktop 的简体中文语言补丁包。

## 适用范围

- 平台：Windows
- 已测试版本：Claude Desktop `1.6259.1`
- 安装形态：官方 MSIX / WindowsApps 安装版

补丁只覆盖语言 JSON 文件，不修改账号、API key、会话数据或 Claude Code 配置。

## 目录结构

```text
patch/
  resources/
    zh-CN.json
    en-US.json
    ion-dist/i18n/
      zh-CN.json
      en-US.json
install.ps1
restore.ps1
install-uac.vbs
restore-uac.vbs
scripts/
  verify.ps1
  build-release.ps1
```

说明：

- `zh-CN.json`：新增中文语言包。
- `en-US.json`：同样写入中文，用于强制覆盖当前仍走英文槽位的界面。
- `install.ps1`：安装补丁，并自动备份被覆盖文件。
- `restore.ps1`：从最近一次备份恢复。

## 安装

### 方式一：UAC 启动器

双击：

```text
install-uac.vbs
```

同意 UAC 后会自动安装并重启 Claude。

### 方式二：管理员 PowerShell

在仓库目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

可选参数：

```powershell
# 不重启 Claude
powershell -ExecutionPolicy Bypass -File .\install.ps1 -NoRestart

# 只安装 zh-CN，不覆盖 en-US
powershell -ExecutionPolicy Bypass -File .\install.ps1 -NoForceEnglishSlot

# 指定 Claude app 目录
powershell -ExecutionPolicy Bypass -File .\install.ps1 -ClaudeAppDir "C:\Program Files\WindowsApps\Claude_...\app"
```

## 恢复

双击：

```text
restore-uac.vbs
```

或管理员 PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\restore.ps1
```

指定备份目录：

```powershell
powershell -ExecutionPolicy Bypass -File .\restore.ps1 -BackupDir ".\backups\claude-desktop-language.20260507-123456"
```

## 校验

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

校验内容：

- 语言包都是合法 JSON。
- 关键翻译 key 存在。
- 仓库中不包含明显 API key / token 字符串。

## 打包发布

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-release.ps1 -Version 1.6259.1
```

输出：

```text
dist/claude-desktop-zh-cn-patch-1.6259.1.zip
```

## 注意

1. Claude 更新后可能覆盖语言文件，需要重新运行 `install.ps1`。
2. 安装需要管理员权限，因为官方 Claude 位于 `C:\Program Files\WindowsApps`。
3. 此项目不是 Claude 官方插件。Claude Desktop 的插件系统不能修改主界面语言资源，所以只能通过资源补丁实现。
4. 如果只安装 `zh-CN.json` 后界面仍显示英文，请使用默认安装方式，让脚本同时覆盖 `en-US.json`。
