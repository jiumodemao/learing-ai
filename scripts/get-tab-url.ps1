# 读取当前活动窗口的地址栏 URL（执行前请确保浏览器窗口在最前面）
Add-Type -AssemblyName System.Windows.Forms
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait("^l")
Start-Sleep -Milliseconds 400
[System.Windows.Forms.SendKeys]::SendWait("^c")
Start-Sleep -Milliseconds 400
(Get-Clipboard -Raw).Trim()
