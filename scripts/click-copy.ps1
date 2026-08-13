Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System.Runtime.InteropServices;
public class W32 {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, uint e);
}
"@
# Click inside page body (center-ish), then select all + copy
[W32]::SetCursorPos(1200, 500) | Out-Null
Start-Sleep -Milliseconds 300
[W32]::mouse_event(2,0,0,0,0) | Out-Null
[W32]::mouse_event(4,0,0,0,0) | Out-Null
Start-Sleep -Milliseconds 600
[System.Windows.Forms.SendKeys]::SendWait("^a")
Start-Sleep -Milliseconds 600
[System.Windows.Forms.SendKeys]::SendWait("^c")
Start-Sleep -Milliseconds 900
