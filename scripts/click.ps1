param([int]$x, [int]$y)
Add-Type @"
using System.Runtime.InteropServices;
public class W32 {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, uint e);
}
"@
[W32]::SetCursorPos($x, $y) | Out-Null
Start-Sleep -Milliseconds 250
[W32]::mouse_event(2,0,0,0,0) | Out-Null
[W32]::mouse_event(4,0,0,0,0) | Out-Null
Start-Sleep -Milliseconds 400
