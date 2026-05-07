Set shell = CreateObject("Shell.Application")
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
script = root & "\install.ps1"
args = "-NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & script & Chr(34)
shell.ShellExecute "powershell.exe", args, root, "runas", 1
