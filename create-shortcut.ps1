$RepoRoot = $PSScriptRoot
$StartScript = Join-Path $RepoRoot "start.ps1"
$ShortcutPath = [System.IO.Path]::Combine([Environment]::GetFolderPath("Desktop"), "KnessetIL.lnk")

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-ExecutionPolicy Bypass -File `"$StartScript`""
$Shortcut.WorkingDirectory = $RepoRoot
$Shortcut.WindowStyle = 1
$Shortcut.Description = "Start KnessetIL Dev Stack"
$Shortcut.IconLocation = "powershell.exe,0"
$Shortcut.Save()

Write-Host "Shortcut created at: $ShortcutPath" -ForegroundColor Green
Write-Host "Double-click KnessetIL on your desktop to start." -ForegroundColor Cyan
