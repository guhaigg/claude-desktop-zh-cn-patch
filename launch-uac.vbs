Set shell = CreateObject("Shell.Application")
Set fs = CreateObject("Scripting.FileSystemObject")
baseDir = fs.GetParentFolderName(WScript.ScriptFullName)
script = baseDir & "\install-appx.ps1"
args = "-NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & script & Chr(34)
shell.ShellExecute "powershell.exe", args, baseDir, "runas", 1
